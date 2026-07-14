"""
TransparentGuard Python SDK — Policy Loader
Reads and validates TPS YAML policy files.
Resolves `extends` inheritance chains (local paths and https:// URIs).
"""

from __future__ import annotations

import json
import os
import stat
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import yaml  # type: ignore[import]

from .types import TPSPolicy

# ---------------------------------------------------------------------------
# Schema — minimal validation (full schema in validator)
# ---------------------------------------------------------------------------

_REQUIRED_FIELDS = {"tps_version", "name", "rules", "audit"}
_SUPPORTED_VERSIONS = {"1.0"}
_MAX_EXTENDS_DEPTH = 5

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

_cache: Dict[str, Tuple[TPSPolicy, float]] = {}


class PolicyLoadError(Exception):
    def __init__(self, message: str, cause: Optional[Exception] = None) -> None:
        super().__init__(message)
        self.cause = cause


# ---------------------------------------------------------------------------
# JSON Schema validation
# ---------------------------------------------------------------------------

def _validate_schema(doc: Any, source_name: str) -> None:
    try:
        from jsonschema import validate, ValidationError  # type: ignore[import]
    except ImportError:
        # jsonschema not installed — skip full validation, do minimal checks
        _minimal_validate(doc, source_name)
        return

    schema: Dict[str, Any] = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "required": ["tps_version", "name", "rules", "audit"],
        "additionalProperties": True,
        "properties": {
            "tps_version": {"type": "string", "enum": ["1.0"]},
            "name": {"type": "string", "minLength": 1},
            "rules": {"type": "array"},
            "audit": {
                "type": "object",
                "required": ["enabled"],
                "properties": {
                    "enabled": {"type": "boolean"},
                },
            },
        },
    }
    try:
        validate(instance=doc, schema=schema)
    except ValidationError as e:
        raise PolicyLoadError(
            f"Policy validation failed in {source_name}: {e.message}"
        ) from e


def _minimal_validate(doc: Any, source_name: str) -> None:
    if not isinstance(doc, dict):
        raise PolicyLoadError(f"Policy {source_name} is not a YAML object.")
    for field in _REQUIRED_FIELDS:
        if field not in doc:
            raise PolicyLoadError(
                f"Policy {source_name}: missing required field '{field}'."
            )
    if doc.get("tps_version") not in _SUPPORTED_VERSIONS:
        raise PolicyLoadError(
            f"Policy {source_name}: unsupported tps_version '{doc.get('tps_version')}'. "
            f"Supported: {', '.join(_SUPPORTED_VERSIONS)}."
        )
    if not isinstance(doc.get("rules"), list):
        raise PolicyLoadError(f"Policy {source_name}: 'rules' must be a list.")
    audit = doc.get("audit")
    if not isinstance(audit, dict) or "enabled" not in audit:
        raise PolicyLoadError(
            f"Policy {source_name}: 'audit' must be an object with 'enabled' field."
        )


# ---------------------------------------------------------------------------
# Extends resolution
# ---------------------------------------------------------------------------

def _merge_policies(base: TPSPolicy, child: TPSPolicy) -> TPSPolicy:
    """
    Merges base and child policies per TPS v1.0 Section 21.2.
    Child rules override base rules with the same ID.
    Compliance frameworks are unioned.
    Audit and environments are completely replaced by child if present.
    """
    base_rule_map = {r["id"]: r for r in base.get("rules", [])}
    child_rule_ids = {r["id"] for r in child.get("rules", [])}

    merged_rules = [r for r in base.get("rules", []) if r["id"] not in child_rule_ids]
    merged_rules.extend(child.get("rules", []))

    base_frameworks = set(base.get("compliance_frameworks", []) or [])
    child_frameworks = set(child.get("compliance_frameworks", []) or [])
    merged_frameworks = list(base_frameworks | child_frameworks)

    result: TPSPolicy = {**base, **child}  # type: ignore[misc]
    result["rules"] = merged_rules
    if merged_frameworks:
        result["compliance_frameworks"] = merged_frameworks
    elif "compliance_frameworks" in result and not merged_frameworks:
        result.pop("compliance_frameworks", None)

    # Child completely replaces for environments and audit
    if "environments" not in child and "environments" in base:
        result["environments"] = base["environments"]
    if "audit" not in child and "audit" in base:
        result["audit"] = base["audit"]

    # Deduplicate (base_rule_map no-op reference to avoid unused var)
    _ = base_rule_map

    return result


async def _resolve_extends_async(
    policy: TPSPolicy, source_dir: str, depth: int
) -> TPSPolicy:
    if "extends" not in policy or not policy["extends"]:
        return policy
    if depth > _MAX_EXTENDS_DEPTH:
        raise PolicyLoadError(
            f"Policy '{policy['name']}': extends chain exceeds maximum depth of "
            f"{_MAX_EXTENDS_DEPTH}. Check for circular references."
        )

    extends_uri: str = policy["extends"]  # type: ignore[assignment]

    if extends_uri.startswith("tps://"):
        import warnings
        warnings.warn(
            f"tps:// registry URIs are not yet supported. Skipping extends: {extends_uri}",
            stacklevel=4,
        )
        return policy

    if extends_uri.startswith("https://"):
        try:
            import httpx  # type: ignore[import]
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(extends_uri)
                resp.raise_for_status()
                raw = resp.text
        except Exception as exc:
            raise PolicyLoadError(
                f"Policy '{policy['name']}': cannot fetch extends URI '{extends_uri}': {exc}"
            ) from exc
    elif extends_uri.startswith("http://"):
        raise PolicyLoadError(
            f"Policy '{policy['name']}': http:// is not permitted for extends URIs. Use https://."
        )
    else:
        resolved_path = Path(source_dir) / extends_uri
        try:
            raw = resolved_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise PolicyLoadError(
                f"Policy '{policy['name']}': cannot read extends file '{resolved_path}': {exc}"
            ) from exc

    base_policy = _parse_and_validate(raw, extends_uri, verify_sig=False)
    base_policy = await _resolve_extends_async(base_policy, source_dir, depth + 1)
    return _merge_policies(base_policy, policy)


# ---------------------------------------------------------------------------
# Parsing + validation
# ---------------------------------------------------------------------------

def _parse_and_validate(raw: str, source_name: str, *, verify_sig: bool = True) -> TPSPolicy:
    try:
        doc = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        raise PolicyLoadError(f"YAML parse error in {source_name}: {exc}", cause=exc) from exc

    _validate_schema(doc, source_name)
    policy: TPSPolicy = doc  # type: ignore[assignment]

    # Validate rule IDs are unique
    ids = [r.get("id") for r in policy.get("rules", [])]
    seen: set[str] = set()
    for rid in ids:
        if rid in seen:
            raise PolicyLoadError(
                f"Policy '{policy['name']}': duplicate rule id '{rid}'."
            )
        if rid and rid.startswith("tg_framework_"):
            raise PolicyLoadError(
                f"Policy '{policy['name']}': rule id '{rid}' starts with 'tg_framework_', "
                "which is reserved for built-in compliance framework rules."
            )
        if rid:
            seen.add(rid)

    return policy


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def load_policy_async(file_path: str) -> TPSPolicy:
    """
    Loads a TPS policy from a YAML file path.
    Validates the structure, resolves `extends` chains.
    Results are cached by (path, mtime).
    """
    resolved = os.path.realpath(file_path)
    try:
        mtime = os.path.getmtime(resolved)
    except OSError as exc:
        raise PolicyLoadError(f"Policy file not found: {resolved}", cause=exc) from exc

    cached = _cache.get(resolved)
    if cached and cached[1] == mtime:
        return cached[0]

    try:
        raw = Path(resolved).read_text(encoding="utf-8")
    except OSError as exc:
        raise PolicyLoadError(f"Cannot read policy file: {resolved}", cause=exc) from exc

    policy = _parse_and_validate(raw, resolved)
    source_dir = str(Path(resolved).parent)
    policy = await _resolve_extends_async(policy, source_dir, 0)

    _cache[resolved] = (policy, mtime)
    return policy


def load_policy_sync(file_path: str) -> TPSPolicy:
    """Synchronous policy loader. Runs the async version in a new event loop."""
    import asyncio
    return asyncio.run(load_policy_async(file_path))


def parse_policy(raw_yaml: str, source_name: str = "<inline>") -> TPSPolicy:
    """Parses and validates a TPS policy from a raw YAML string."""
    return _parse_and_validate(raw_yaml, source_name)
