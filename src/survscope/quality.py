"""TCGA-CDR endpoint-use recommendations from Liu et al. (Cell, 2018)."""

from __future__ import annotations

# Values are transcribed from Table 3. A check with an asterisk is exposed as
# "caution"; a plain check (including approximate/accurate DSS derivations) is
# "recommended"; a cross is "not_recommended"; NA is "unavailable".
_USES = {
    "ACC": ("recommended", "recommended", "caution", "recommended"),
    "BLCA": ("recommended", "recommended", "recommended", "recommended"),
    "BRCA": ("caution", "recommended", "recommended", "caution"),
    "CESC": ("recommended", "recommended", "recommended", "recommended"),
    "CHOL": ("recommended", "recommended", "caution", "caution"),
    "COAD": ("recommended", "recommended", "recommended", "recommended"),
    "DLBC": ("not_recommended", "caution", "not_recommended", "not_recommended"),
    "ESCA": ("recommended", "recommended", "recommended", "recommended"),
    "GBM": ("recommended", "recommended", "not_recommended", "recommended"),
    "HNSC": ("recommended", "recommended", "recommended", "recommended"),
    "KICH": ("caution", "caution", "not_recommended", "caution"),
    "KIRC": ("recommended", "recommended", "caution", "recommended"),
    "KIRP": ("recommended", "recommended", "recommended", "recommended"),
    "LAML": ("recommended", "unavailable", "unavailable", "unavailable"),
    "LGG": ("caution", "recommended", "recommended", "caution"),
    "LIHC": ("recommended", "recommended", "recommended", "caution"),
    "LUAD": ("recommended", "recommended", "recommended", "recommended"),
    "LUSC": ("recommended", "recommended", "recommended", "recommended"),
    "MESO": ("recommended", "recommended", "not_recommended", "recommended"),
    "OV": ("recommended", "recommended", "recommended", "recommended"),
    "PAAD": ("recommended", "recommended", "recommended", "recommended"),
    "PCPG": (
        "not_recommended",
        "not_recommended",
        "not_recommended",
        "not_recommended",
    ),
    "PRAD": ("caution", "recommended", "recommended", "not_recommended"),
    "READ": ("caution", "recommended", "not_recommended", "caution"),
    "SARC": ("recommended", "recommended", "recommended", "recommended"),
    "SKCM": ("recommended", "recommended", "unavailable", "recommended"),
    "STAD": ("recommended", "recommended", "recommended", "recommended"),
    "TGCT": ("not_recommended", "recommended", "recommended", "not_recommended"),
    "THCA": ("caution", "recommended", "recommended", "not_recommended"),
    "THYM": ("not_recommended", "recommended", "unavailable", "not_recommended"),
    "UCEC": ("recommended", "recommended", "recommended", "recommended"),
    "UCS": ("recommended", "recommended", "caution", "recommended"),
    "UVM": ("recommended", "recommended", "unavailable", "recommended"),
}

_NOTES = {
    "ACC": "The TCGA-CDR table notes a small number of events.",
    "BRCA": "Longer follow-up is needed for OS and DSS.",
    "CHOL": "The cohort sample size is small for all endpoints.",
    "DLBC": "Sample size and event counts are small; longer follow-up is needed.",
    "GBM": "Too few disease-free cases support DFI analysis.",
    "KICH": "Event counts are small and longer follow-up is needed.",
    "KIRC": "The TCGA-CDR table notes a small number of events.",
    "LAML": "Only OS data are available.",
    "LGG": "Longer follow-up is needed for OS and DSS.",
    "LIHC": "Longer follow-up is needed for DSS.",
    "MESO": "The DFI sample size is small.",
    "PCPG": "Follow-up and event counts are insufficient for all four endpoints.",
    "PRAD": "Longer follow-up is needed for OS and DSS.",
    "READ": "Longer follow-up is needed for OS, DSS, and DFI; DFI events are sparse.",
    "SKCM": "No information is available to derive DFI.",
    "TGCT": "OS and DSS events are sparse and longer follow-up is needed.",
    "THCA": "OS and DSS events are sparse and longer follow-up is needed.",
    "THYM": "OS and DSS events are sparse; DFI cannot be derived.",
    "UCS": "The cohort sample size is small.",
    "UVM": "No information is available to derive DFI.",
}

_ORDER = ("OS", "PFI", "DFI", "DSS")


def endpoint_quality(cohort: str, endpoint: str) -> tuple[str, str]:
    """Return TCGA-CDR use class and explanatory note."""
    cohort = cohort.upper()
    endpoint = endpoint.upper()
    use = _USES.get(cohort, ("caution",) * 4)[_ORDER.index(endpoint)]
    return use, _NOTES.get(cohort, "")


def cohort_quality(cohort: str) -> dict[str, dict[str, str]]:
    """Return JSON-compatible quality metadata for all four endpoints."""
    return {
        endpoint: {
            "quality": endpoint_quality(cohort, endpoint)[0],
            "note": endpoint_quality(cohort, endpoint)[1],
        }
        for endpoint in ("OS", "DSS", "PFI", "DFI")
    }
