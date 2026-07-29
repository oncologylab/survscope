"""Typed analysis results used by the CLI and plotting API."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np


def _number_or_none(value: float) -> float | None:
    return float(value) if np.isfinite(value) else None


@dataclass(frozen=True)
class Curve:
    """Kaplan-Meier step coordinates and group totals."""

    x_months: np.ndarray
    survival: np.ndarray
    n: int
    events: int


@dataclass
class EndpointResult:
    """One survival endpoint result."""

    endpoint: str
    quality: str
    quality_note: str
    n: int
    n_low: int
    n_high: int
    events: int
    events_low: int
    events_high: int
    cutoff_tpm: float
    logrank_chi2: float
    logrank_p: float
    logrank_q: float = np.nan
    cox_hr: float = np.nan
    cox_p: float = np.nan
    low: Curve | None = None
    high: Curve | None = None
    warning: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Return JSON-compatible endpoint statistics without curve arrays."""
        return {
            "endpoint": self.endpoint,
            "quality": self.quality,
            "quality_note": self.quality_note,
            "n": self.n,
            "n_low": self.n_low,
            "n_high": self.n_high,
            "events": self.events,
            "events_low": self.events_low,
            "events_high": self.events_high,
            "cutoff_tpm": _number_or_none(self.cutoff_tpm),
            "logrank_chi2": _number_or_none(self.logrank_chi2),
            "logrank_p": _number_or_none(self.logrank_p),
            "logrank_q": _number_or_none(self.logrank_q),
            "cox_hr": _number_or_none(self.cox_hr),
            "cox_p": _number_or_none(self.cox_p),
            "warning": self.warning,
        }


@dataclass
class SurvivalAnalysis:
    """Complete four-endpoint analysis for a gene and TCGA cohort."""

    gene: str
    ensembl: str
    cohort: str
    cohort_label: str
    cutoff: str | float
    data_version: str
    source_expression: str
    source_survival: str
    endpoints: dict[str, EndpointResult] = field(default_factory=dict)

    @property
    def filename_stem(self) -> str:
        return f"{self.gene}_TCGA_{self.cohort}_KM_survival"

    def to_dict(self) -> dict[str, Any]:
        return {
            "gene": self.gene,
            "ensembl": self.ensembl,
            "cohort": self.cohort,
            "cohort_label": self.cohort_label,
            "cutoff": self.cutoff,
            "data_version": self.data_version,
            "source_expression": self.source_expression,
            "source_survival": self.source_survival,
            "endpoints": {
                endpoint: result.to_dict() for endpoint, result in self.endpoints.items()
            },
        }


@dataclass(frozen=True)
class PlotOutputs:
    """Paths created by :func:`survscope.plot`."""

    paths: tuple[Path, ...]
