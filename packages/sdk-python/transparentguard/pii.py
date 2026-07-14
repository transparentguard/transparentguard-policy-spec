"""
TransparentGuard Python SDK — PII Detector
Regex-based personally identifiable information detection.
Covers the same PII categories as the TypeScript runtime.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from .types import PiiCategory, PiiTarget


# ---------------------------------------------------------------------------
# PII Match
# ---------------------------------------------------------------------------

@dataclass
class PiiMatch:
    category: str
    start: int
    end: int
    original: str
    confidence: float = 1.0


# ---------------------------------------------------------------------------
# Regex patterns per category
# ---------------------------------------------------------------------------

_PATTERNS: Dict[str, List[re.Pattern[str]]] = {
    "email": [
        re.compile(
            r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b",
            re.IGNORECASE,
        )
    ],
    "phone": [
        re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
        re.compile(r"\b\+[1-9]\d{7,14}\b"),
    ],
    "ssn": [
        re.compile(r"\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b"),
    ],
    "credit_card": [
        re.compile(r"\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13}|3(?:0[0-5]|[68]\d)\d{11}|6(?:011|5\d{2})\d{12}|(?:2131|1800|35\d{3})\d{11})\b"),
        re.compile(r"\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b"),
    ],
    "ip_address": [
        re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b"),
        re.compile(
            r"\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|"
            r"\b(?:[0-9a-fA-F]{1,4}:)*::(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}\b"
        ),
    ],
    "iban": [
        re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]?){0,16}\b"),
    ],
    "passport": [
        re.compile(r"\b[A-Z]{1,2}\d{6,9}\b"),
        re.compile(r"\bpassport\s*(?:number|no\.?|#)?\s*:?\s*([A-Z]{1,2}\d{6,9})\b", re.IGNORECASE),
    ],
    "driver_license": [
        re.compile(r"\b(?:driver(?:'?s)?\s*licen[cs]e|dl|d\.l\.)\s*(?:number|no\.?|#)?\s*:?\s*([A-Z0-9]{6,15})\b", re.IGNORECASE),
    ],
    "bank_account": [
        re.compile(r"\b(?:account|acct)\.?\s*(?:number|no\.?|#)?\s*:?\s*\d{8,17}\b", re.IGNORECASE),
    ],
    "mrn": [
        re.compile(r"\bMRN[-:\s]?\d{6,10}\b", re.IGNORECASE),
        re.compile(r"\bmedical\s+record\s+(?:number|no\.?|#)?\s*:?\s*\d{6,10}\b", re.IGNORECASE),
    ],
    "dob": [
        re.compile(r"\b(?:DOB|date\s+of\s+birth)\s*:?\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b", re.IGNORECASE),
        re.compile(r"\b(?:born|birth(?:day)?)\s+(?:on\s+)?\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b", re.IGNORECASE),
    ],
    "name": [
        # Contextual name detection — looks for "Name: John Smith" patterns
        re.compile(r"\b(?:patient|client|customer|user|name)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b"),
        # Full name in PII context (e.g., "I am John Smith" in medical context)
        re.compile(r"\b(?:I am|my name is|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b"),
    ],
    "address": [
        re.compile(
            r"\b\d{1,5}\s+[A-Za-z0-9\s,\.]{3,50}"
            r"(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Way|Court|Ct|Place|Pl)"
            r"(?:\s*,\s*(?:Suite|Ste|Apt|Unit|#)\s*[\w\d]+)?"
            r"(?:\s*,\s*[A-Za-z\s]+)?"
            r"(?:\s*,\s*[A-Z]{2})?"
            r"(?:\s+\d{5}(?:-\d{4})?)?\b",
            re.IGNORECASE,
        )
    ],
    "crypto_address": [
        # Bitcoin
        re.compile(r"\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b"),
        # Ethereum
        re.compile(r"\b0x[a-fA-F0-9]{40}\b"),
    ],
    "tax_id": [
        re.compile(r"\b(?:EIN|tax\s+id)\s*:?\s*\d{2}-\d{7}\b", re.IGNORECASE),
    ],
    "health_condition": [
        re.compile(
            r"\b(?:diagnosed with|suffers? from|has|history of|treatment for)\s+"
            r"(?:diabetes|cancer|HIV|AIDS|hepatitis|depression|anxiety|bipolar|schizophrenia"
            r"|hypertension|heart disease|epilepsy|Alzheimer'?s|dementia|ADHD|autism"
            r"|lupus|multiple sclerosis|Parkinson'?s|PTSD|OCD)\b",
            re.IGNORECASE,
        )
    ],
    "national_id": [
        re.compile(r"\b(?:national\s+id|NIN|national\s+insurance)\s*(?:number|no\.?|#)?\s*:?\s*[A-Z0-9]{6,15}\b", re.IGNORECASE),
    ],
    "npi": [
        re.compile(r"\bNPI\s*(?:number|no\.?|#)?\s*:?\s*\d{10}\b", re.IGNORECASE),
    ],
}

# ---------------------------------------------------------------------------
# Category expansions (logical groups)
# ---------------------------------------------------------------------------

_CATEGORY_EXPANSION: Dict[str, List[str]] = {
    "pii_all": [
        "name", "email", "phone", "address", "ip_address", "ssn", "passport",
        "driver_license", "national_id", "tax_id", "credit_card", "bank_account",
        "iban", "crypto_address", "mrn", "dob", "health_condition", "npi",
        "race", "religion", "political_opinion", "sexual_orientation",
        "biometric", "genetic", "union_membership",
    ],
    "phi": [
        "name", "address", "phone", "email", "dob", "ssn", "mrn",
        "health_condition", "insurance_id", "npi", "dea",
    ],
    "pii_standard": [
        "name", "email", "phone", "address", "ip_address", "username",
    ],
    "pii_financial": [
        "credit_card", "bank_account", "iban", "swift", "crypto_address", "tax_id",
    ],
    "pii_sensitive": [
        "ssn", "passport", "driver_license", "national_id", "voter_id",
        "mrn", "health_condition", "biometric", "genetic",
        "race", "religion", "political_opinion", "sexual_orientation", "union_membership",
    ],
}


def expand_categories(categories: List[str]) -> Set[str]:
    """Expands logical category groups to their constituent categories."""
    expanded: Set[str] = set()
    for cat in categories:
        if cat in _CATEGORY_EXPANSION:
            expanded.update(_CATEGORY_EXPANSION[cat])
        else:
            expanded.add(cat)
    return expanded


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

def detect_pii(text: str, target: PiiTarget) -> List[PiiMatch]:
    """
    Detects PII in the given text for the specified PiiTarget configuration.
    Returns a list of PiiMatch objects sorted by start position.
    """
    confidence_threshold = target.get("confidence_threshold", 0.70)
    categories = expand_categories(list(target.get("categories", [])))

    matches: List[PiiMatch] = []
    seen: Set[tuple[int, int]] = set()

    for category in categories:
        patterns = _PATTERNS.get(category, [])
        for pattern in patterns:
            for m in pattern.finditer(text):
                span = (m.start(), m.end())
                if span in seen:
                    continue
                # Assign confidence based on match quality, checksums, and context
                confidence = _confidence_for_category(category, m.group(0), text)
                if confidence < confidence_threshold:
                    continue
                seen.add(span)
                matches.append(PiiMatch(
                    category=category,
                    start=m.start(),
                    end=m.end(),
                    original=m.group(0),
                    confidence=confidence,
                ))

    matches.sort(key=lambda x: x.start)
    return _remove_overlapping(matches)


def _luhn_check(number: str) -> bool:
    """Luhn algorithm checksum — validates credit card numbers."""
    digits = [int(c) for c in number if c.isdigit()]
    if len(digits) < 13:
        return False
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _ssn_valid_range(digits: str) -> bool:
    """Rejects known-invalid SSN area numbers (000, 666, 900-999)."""
    if len(digits) < 3:
        return False
    area = int(digits[:3])
    return area not in (0, 666) and not (900 <= area <= 999)


def _confidence_for_category(category: str, match_text: str, full_text: str = "") -> float:
    """
    Computes a dynamic confidence score for a PII match.

    Signals (additive, clamped to [0.0, 1.0]):
    - Base score per category precision tier
    - +0.08 for labelled match (PII keyword adjacent in context)
    - +0.08 checksum bonus for credit_card/ssn passing validation
    - -0.15 penalty (capped at 0.60) if checksum fails
    - +0.05 if PII-adjacent context words appear within 100 chars of match
    """
    high_precision = {
        "email", "credit_card", "ssn", "iban", "ip_address",
        "crypto_address", "mrn", "npi", "tax_id",
    }
    medium_precision = {
        "phone", "passport", "bank_account", "dob", "driver_license",
        "national_id", "health_condition",
    }

    if category in high_precision:
        base = 0.88
    elif category in medium_precision:
        base = 0.76
    else:
        base = 0.65  # name, address, keyword categories

    score = base

    # Labelled match: PII keyword appears just before the match in full text
    if full_text:
        match_pos = full_text.find(match_text)
        if match_pos > 0:
            pre_window = full_text[max(0, match_pos - 80):match_pos].lower()
            label_keywords = [
                "ssn", "passport", "dob", "routing", "ein", "tin", "iban",
                "mrn", "npi", "credit card", "credit_card", "driver", "license",
                "account", "member id", "patient", "date of birth",
            ]
            if any(kw in pre_window for kw in label_keywords):
                score += 0.08

            # Context proximity: PII-adjacent nouns near the match
            window_start = max(0, match_pos - 100)
            window_end   = min(len(full_text), match_pos + len(match_text) + 100)
            context = full_text[window_start:window_end].lower()
            context_words = [
                "patient", "account", "billing", "insurance", "member",
                "medical record", "diagnosis", "prescription", "routing",
                "social security", "birth", "license", "passport",
            ]
            if any(w in context for w in context_words):
                score += 0.05

    # Checksum / range validation
    clean = re.sub(r"[\s\-]", "", match_text)
    if category == "credit_card":
        if _luhn_check(clean):
            score += 0.08
        else:
            score -= 0.15
            score = min(score, 0.60)
    elif category == "ssn":
        digits_only = re.sub(r"\D", "", clean)
        if _ssn_valid_range(digits_only):
            score += 0.08
        else:
            score -= 0.15
            score = min(score, 0.60)

    return max(0.0, min(1.0, score))


def _remove_overlapping(matches: List[PiiMatch]) -> List[PiiMatch]:
    """Removes overlapping matches, keeping the one with higher confidence."""
    if not matches:
        return []
    result = [matches[0]]
    for match in matches[1:]:
        last = result[-1]
        if match.start < last.end:
            # Overlap — keep the one with higher confidence
            if match.confidence > last.confidence:
                result[-1] = match
        else:
            result.append(match)
    return result


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------

def redact_text(text: str, matches: List[PiiMatch]) -> str:
    """
    Applies redaction to the given text, replacing each matched span
    with [REDACTED:<CATEGORY>].
    Processes matches in reverse order to preserve character positions.
    """
    result = text
    for match in reversed(sorted(matches, key=lambda m: m.start)):
        replacement = f"[REDACTED:{match.category.upper()}]"
        result = result[:match.start] + replacement + result[match.end:]
    return result
