"""
TransparentGuard Python SDK — Policy Test Runner
Executes inline policy tests from the `tests` section of a TPS policy file.
No real LLM calls are made.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

from .types import EvaluateResult, RequestPayload, ResponsePayload, TPSPolicy
from .license import LicenseStatus
from .engine import evaluate


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class TestFailure:
    field: str
    expected: Any
    actual: Any
    message: str


@dataclass
class PolicyTestResult:
    id: str
    description: Optional[str]
    passed: bool
    failures: List[TestFailure]
    outcome: str
    duration_ms: float


@dataclass
class PolicyTestSuiteResult:
    policy_name: str
    total: int
    passed: int
    failed: int
    results: List[PolicyTestResult]


# ---------------------------------------------------------------------------
# Outcome computation
# ---------------------------------------------------------------------------

def _compute_outcome(result: EvaluateResult) -> str:
    if not result["allowed"]:
        return "blocked"
    violations = result["violations"]
    if not violations:
        return "allowed"
    if any(v["outcome"] == "redacted" for v in violations):
        return "allowed_with_modifications"
    if any(v["outcome"] == "warned" for v in violations):
        return "warned"
    return "allowed"


# ---------------------------------------------------------------------------
# Assertion
# ---------------------------------------------------------------------------

def _assert_test(
    result: EvaluateResult,
    expect: Dict[str, Any],
) -> List[TestFailure]:
    failures: List[TestFailure] = []
    actual_outcome = _compute_outcome(result)

    if actual_outcome != expect.get("outcome"):
        failures.append(TestFailure(
            field="outcome",
            expected=expect.get("outcome"),
            actual=actual_outcome,
            message=f"Expected outcome '{expect.get('outcome')}' but got '{actual_outcome}'",
        ))

    for expected_rule in (expect.get("rules_triggered") or []):
        rule_id = expected_rule.get("rule_id") if isinstance(expected_rule, dict) else expected_rule
        action_taken = expected_rule.get("action_taken") if isinstance(expected_rule, dict) else None
        min_violations = (expected_rule.get("min_violations", 1) if isinstance(expected_rule, dict) else 1)

        matching = [v for v in result["violations"] if v["rule_id"] == rule_id]
        if not matching:
            failures.append(TestFailure(
                field=f"rules_triggered[{rule_id}]",
                expected="triggered",
                actual="not triggered",
                message=f"Expected rule '{rule_id}' to trigger but it did not",
            ))
            continue
        if action_taken:
            if not any(v["outcome"] == action_taken for v in matching):
                actions = ", ".join(v["outcome"] for v in matching)
                failures.append(TestFailure(
                    field=f"rules_triggered[{rule_id}].action_taken",
                    expected=action_taken,
                    actual=actions,
                    message=f"Rule '{rule_id}' triggered but action was '{actions}', expected '{action_taken}'",
                ))
        if len(matching) < min_violations:
            failures.append(TestFailure(
                field=f"rules_triggered[{rule_id}].min_violations",
                expected=min_violations,
                actual=len(matching),
                message=f"Rule '{rule_id}' triggered {len(matching)} violation(s), expected >= {min_violations}",
            ))

    for rule_id in (expect.get("rules_not_triggered") or []):
        if any(v["rule_id"] == rule_id for v in result["violations"]):
            failures.append(TestFailure(
                field=f"rules_not_triggered[{rule_id}]",
                expected="not triggered",
                actual="triggered",
                message=f"Expected rule '{rule_id}' NOT to trigger but it did",
            ))

    for expected_redaction in (expect.get("redactions") or []):
        category = expected_redaction.get("category", "")
        count = expected_redaction.get("count")
        matching = [v for v in result["violations"] if v.get("outcome") == "redacted" and v.get("category") == category]
        if not matching:
            failures.append(TestFailure(
                field=f"redactions[{category}]",
                expected=f"at least 1 redaction of category '{category}'",
                actual="none",
                message=f"Expected redaction of category '{category}' but none found",
            ))
        elif count is not None and len(matching) < count:
            failures.append(TestFailure(
                field=f"redactions[{category}].count",
                expected=count,
                actual=len(matching),
                message=f"Expected {count} redaction(s) of category '{category}' but found {len(matching)}",
            ))

    return failures


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def run_policy_tests(
    policy: TPSPolicy,
    license_status: LicenseStatus,
) -> PolicyTestSuiteResult:
    """
    Runs all inline tests declared in the policy's `tests` section.
    No real LLM calls are made.
    Returns a PolicyTestSuiteResult with pass/fail per test.
    """
    import time as _time

    tests = policy.get("tests") or []
    results: List[PolicyTestResult] = []

    for test in tests:
        start = _time.monotonic()
        try:
            stage = test.get("stage", "pre-request")
            input_data = test.get("input", {})
            messages = input_data.get("messages", [])
            provider = input_data.get("provider", "openai/gpt-4o")

            if stage == "pre-request":
                payload: Union[RequestPayload, ResponsePayload] = {
                    "messages": [{"role": m["role"], "content": m.get("content", "")} for m in messages],
                    "provider": provider,
                }
            else:
                response = input_data.get("response", {})
                payload = {
                    "content": response.get("content", ""),
                    "provider": provider,
                    "system_prompt": next(
                        (m.get("content") for m in messages if m.get("role") == "system"),
                        None,
                    ),
                }

            result = evaluate(
                stage if stage != "tool-call" else "pre-request",
                payload,
                policy,
                license_status,
                {"request_id": f"test_{test['id']}"},
            )
            duration_ms = (_time.monotonic() - start) * 1000
            failures = _assert_test(result, test.get("expect", {}))
            outcome = _compute_outcome(result)

        except Exception as exc:
            duration_ms = (_time.monotonic() - start) * 1000
            failures = [TestFailure(
                field="evaluation",
                expected="no error",
                actual=str(exc),
                message=f"Evaluation raised: {exc}",
            )]
            outcome = "error"

        results.append(PolicyTestResult(
            id=test["id"],
            description=test.get("description"),
            passed=len(failures) == 0,
            failures=failures,
            outcome=outcome,
            duration_ms=duration_ms,
        ))

    passed = sum(1 for r in results if r.passed)
    return PolicyTestSuiteResult(
        policy_name=policy["name"],
        total=len(results),
        passed=passed,
        failed=len(results) - passed,
        results=results,
    )


def format_test_results(suite: PolicyTestSuiteResult) -> str:
    """Formats test results as a human-readable string."""
    lines: List[str] = []
    lines.append(f"\nRunning {suite.total} test(s) against policy \"{suite.policy_name}\"...\n")
    for r in suite.results:
        icon = "  PASS" if r.passed else "  FAIL"
        desc = f" — {r.description}" if r.description else ""
        lines.append(f"{icon}  {r.id}{desc}")
        if not r.passed:
            for f in r.failures:
                lines.append(f"        {f.message}")
    lines.append("")
    if suite.failed == 0:
        lines.append(f"{suite.passed} passed, 0 failed.")
        lines.append(f"Policy \"{suite.policy_name}\" passed all declared tests.")
    else:
        lines.append(f"{suite.failed} failed, {suite.passed} passed.")
    lines.append("")
    return "\n".join(lines)
