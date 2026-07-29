"""SurvScope public Python API."""

from .analysis import analyze
from .data import DataStore
from .models import EndpointResult, SurvivalAnalysis
from .plotting import plot

__all__ = [
    "DataStore",
    "EndpointResult",
    "SurvivalAnalysis",
    "analyze",
    "available_cohorts",
    "plot",
    "search_genes",
]

__version__ = "0.1.0"


def available_cohorts(store: DataStore | None = None) -> list[dict]:
    """Return cohort records from the selected data release."""
    return (store or DataStore()).available_cohorts()


def search_genes(
    query: str,
    cohort: str | None = None,
    store: DataStore | None = None,
) -> list[dict]:
    """Search supported gene symbols or Ensembl identifiers."""
    return (store or DataStore()).search_genes(query, cohort=cohort)
