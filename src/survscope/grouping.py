"""Outcome-independent expression comparisons shared with the browser."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass(frozen=True)
class GroupingSpec:
    """Choose two expression groups; percentages refer to endpoint-valid patients."""

    kind: str = "median"
    threshold: float | None = None
    percentile: float | None = None
    lower_percent: float | None = None
    upper_percent: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            key: value
            for key, value in {
                "kind": self.kind,
                "threshold": self.threshold,
                "percentile": self.percentile,
                "lowerPercent": self.lower_percent,
                "upperPercent": self.upper_percent,
            }.items()
            if value is not None
        }


def normalize_grouping(
    cutoff: str | float = "median",
    grouping: GroupingSpec | dict | None = None,
) -> GroupingSpec:
    if grouping is not None:
        if str(cutoff).lower() != "median":
            raise ValueError("Choose either grouping or a custom cutoff, not both.")
        if isinstance(grouping, dict):
            allowed = {"kind", "threshold", "percentile", "lowerPercent", "upperPercent"}
            if set(grouping) - allowed:
                raise ValueError("Unrecognized grouping parameter.")
            grouping = GroupingSpec(
                kind=grouping.get("kind", "median"),
                threshold=grouping.get("threshold"),
                percentile=grouping.get("percentile"),
                lower_percent=grouping.get("lowerPercent"),
                upper_percent=grouping.get("upperPercent"),
            )
    elif isinstance(cutoff, str) and cutoff.lower() == "median":
        grouping = GroupingSpec()
    else:
        try:
            grouping = GroupingSpec("tpm", threshold=float(cutoff))
        except (ValueError, TypeError) as error:
            raise ValueError("cutoff must be 'median' or a non-negative TPM value") from error
    if not isinstance(grouping, GroupingSpec):
        raise ValueError("grouping must be a GroupingSpec or grouping dictionary")

    def number(value: Any, name: str) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value):
            raise ValueError(f"{name} must be a finite number.")
        return float(value)

    spec = grouping
    if spec.kind not in {"median", "mean", "tpm", "percentile", "extremes"}:
        raise ValueError(f"Unsupported grouping: {spec.kind}")
    expected = {
        "median": set(),
        "mean": set(),
        "tpm": {"threshold"},
        "percentile": {"percentile"},
        "extremes": {"lowerPercent", "upperPercent"},
    }[spec.kind]
    if set(spec.to_dict()) - {"kind"} != expected:
        raise ValueError("Grouping parameters do not match the selected comparison.")
    if spec.kind == "tpm":
        if number(spec.threshold, "TPM threshold") < 0:
            raise ValueError("TPM threshold must be non-negative.")
    elif spec.kind == "percentile":
        if not 0 < number(spec.percentile, "Percentile") < 100:
            raise ValueError("Percentile must be greater than 0 and less than 100.")
        if spec.percentile == 50:
            return GroupingSpec()
    elif spec.kind == "extremes":
        lower = number(spec.lower_percent, "Lower percentage")
        upper = number(spec.upper_percent, "Upper percentage")
        if not (0 < lower < 100 and 0 < upper < 100 and lower + upper <= 100):
            raise ValueError("Group percentages must be positive and total at most 100.")
        if lower + upper == 100:
            return normalize_grouping(grouping=GroupingSpec("percentile", percentile=lower))
    elif spec.kind not in {"median", "mean"}:
        raise ValueError(f"Unsupported grouping: {spec.kind}")
    return spec


def grouping_label(spec: GroupingSpec) -> str:
    if spec.kind == "median":
        return "Median expression"
    if spec.kind == "mean":
        return "Mean (average) expression"
    if spec.kind == "tpm":
        return f"Expression threshold: {spec.threshold:g} TPM"
    if spec.kind == "percentile":
        return f"{spec.percentile:g}th percentile split"
    return f"Lowest {spec.lower_percent:.4g}% vs highest {spec.upper_percent:.4g}%"


def expression_quantile(values: np.ndarray, probability: float) -> float:
    """R type-7 operation order, including its one-based index arithmetic.

    Equivalent interpolation formulas can round to opposite sides of an
    observed value. Matching this order also preserves threshold membership.
    """
    ordered = sorted(float(value) for value in values)
    index = 1 + (len(ordered) - 1) * probability
    lo, hi = int(np.floor(index)), int(np.ceil(index))
    lower, upper = ordered[lo - 1], ordered[hi - 1]
    if index == lo or lower == upper:
        return lower
    fraction = index - lo
    return (1 - fraction) * lower + fraction * upper


def assign_groups(
    tpm: np.ndarray,
    indices: np.ndarray,
    median: dict,
    spec: GroupingSpec,
) -> tuple[np.ndarray, np.ndarray, float, float]:
    """Return low/high masks and thresholds; neither mask contains the excluded middle."""
    if len(tpm) == 0:
        threshold = float(spec.threshold) if spec.kind == "tpm" else np.nan
        return np.zeros(0, bool), np.zeros(0, bool), threshold, threshold
    if spec.kind == "median":
        stored = median.get("cutoff_tpm")
        lower = float(stored) if stored is not None else expression_quantile(tpm, 0.5)
        high = tpm > lower
        flips = set(median.get("flips", []))
        high ^= np.array([int(index) in flips for index in indices])
        return ~high, high, lower, lower
    if spec.kind == "tpm":
        lower = upper = float(spec.threshold)
    elif spec.kind == "mean":
        # Neumaier summation, with the same operation order in JavaScript.
        total = correction = 0.0
        for value in tpm:
            value = float(value)
            updated = total + value
            correction += (
                (total - updated) + value if abs(total) >= abs(value) else (value - updated) + total
            )
            total = updated
        lower = upper = (total + correction) / len(tpm)
    elif spec.kind == "percentile":
        lower = upper = expression_quantile(tpm, spec.percentile / 100)
    else:
        lower = expression_quantile(tpm, spec.lower_percent / 100)
        upper = expression_quantile(tpm, 1 - spec.upper_percent / 100)
    return tpm <= lower, tpm > upper, float(lower), float(upper)
