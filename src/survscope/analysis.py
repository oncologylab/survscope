"""Survival analysis over compact SurvScope data."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from .constants import ENDPOINTS, MONTH_DAYS
from .data import DataStore, GeneData
from .models import Curve, EndpointResult, SurvivalAnalysis
from .statistics import bh_fdr, cox_binary, kaplan_meier, logrank_test

if TYPE_CHECKING:
    from collections.abc import Sequence


def _number_array(values: Sequence[float | int | None], dtype=float) -> np.ndarray:
    return np.asarray([np.nan if value is None else value for value in values], dtype=dtype)


def analyze(
    gene: str,
    cohort: str,
    cutoff: str | float = "median",
    *,
    store: DataStore | None = None,
) -> SurvivalAnalysis:
    """Analyze one gene in one TCGA cohort.

    A numeric cutoff is interpreted as TPM. The special value ``"median"``
    applies the exact endpoint-specific median grouping recorded during the
    data build.
    """
    data_store = store or DataStore()
    gene_data = data_store.load_gene(gene, cohort)
    return analyze_gene_data(gene_data, cutoff=cutoff)


def analyze_gene_data(
    data: GeneData,
    cutoff: str | float = "median",
) -> SurvivalAnalysis:
    if isinstance(cutoff, str) and cutoff.lower() != "median":
        try:
            cutoff = float(cutoff)
        except ValueError as error:
            raise ValueError("cutoff must be 'median' or a non-negative TPM value") from error
    if not isinstance(cutoff, str) and (not np.isfinite(cutoff) or cutoff < 0):
        raise ValueError("numeric TPM cutoff must be finite and non-negative")

    tpm = data.expression_tpm
    results: dict[str, EndpointResult] = {}
    pvalues: list[float] = []
    for endpoint in ENDPOINTS:
        clinical = data.clinical["endpoints"][endpoint]
        time = _number_array(clinical["time"], dtype=float)
        event = _number_array(clinical["event"], dtype=float)
        valid = np.isfinite(tpm) & np.isfinite(time) & np.isfinite(event) & (time > 0)
        indices = np.flatnonzero(valid)
        endpoint_time = time[valid]
        endpoint_event = event[valid].astype(int)
        endpoint_tpm = tpm[valid]

        median_record = data.medians.get(endpoint, {})
        if isinstance(cutoff, str):
            stored_cutoff = median_record.get("cutoff_tpm")
            endpoint_cutoff = (
                float(stored_cutoff) if stored_cutoff is not None else np.nan
            )
            if not np.isfinite(endpoint_cutoff) and len(endpoint_tpm):
                endpoint_cutoff = float(np.median(endpoint_tpm))
            high = endpoint_tpm > endpoint_cutoff
            flips = set(int(index) for index in median_record.get("flips", []))
            if flips:
                high = high.copy()
                for local_index, global_index in enumerate(indices):
                    if int(global_index) in flips:
                        high[local_index] = not high[local_index]
        else:
            endpoint_cutoff = float(cutoff)
            high = endpoint_tpm > endpoint_cutoff

        low = ~high
        warning = ""
        if len(endpoint_time) == 0:
            warning = "No endpoint-valid samples."
        elif not bool(np.any(low)) or not bool(np.any(high)):
            warning = "The cutoff leaves one expression group empty."
        elif int(np.sum(endpoint_event[low])) == 0 or int(np.sum(endpoint_event[high])) == 0:
            warning = "At least one group has no observed events; inferential statistics may be NA."

        chi2, pvalue = logrank_test(endpoint_time, endpoint_event, high.astype(int))
        hazard_ratio, cox_p = cox_binary(
            endpoint_time,
            endpoint_event,
            high.astype(int),
        )
        low_x, low_y = kaplan_meier(endpoint_time[low], endpoint_event[low])
        high_x, high_y = kaplan_meier(endpoint_time[high], endpoint_event[high])
        quality = clinical.get("quality", "caution")
        quality_note = clinical.get("quality_note", "")
        result = EndpointResult(
            endpoint=endpoint,
            quality=quality,
            quality_note=quality_note,
            n=len(endpoint_time),
            n_low=int(np.sum(low)),
            n_high=int(np.sum(high)),
            events=int(np.sum(endpoint_event)),
            events_low=int(np.sum(endpoint_event[low])),
            events_high=int(np.sum(endpoint_event[high])),
            cutoff_tpm=endpoint_cutoff,
            logrank_chi2=chi2,
            logrank_p=pvalue,
            cox_hr=hazard_ratio,
            cox_p=cox_p,
            low=Curve(
                x_months=low_x / MONTH_DAYS,
                survival=low_y,
                n=int(np.sum(low)),
                events=int(np.sum(endpoint_event[low])),
            ),
            high=Curve(
                x_months=high_x / MONTH_DAYS,
                survival=high_y,
                n=int(np.sum(high)),
                events=int(np.sum(endpoint_event[high])),
            ),
            warning=warning,
        )
        results[endpoint] = result
        pvalues.append(pvalue)

    for endpoint, qvalue in zip(ENDPOINTS, bh_fdr(pvalues), strict=True):
        results[endpoint].logrank_q = qvalue

    return SurvivalAnalysis(
        gene=data.symbol,
        ensembl=data.ensembl,
        cohort=data.cohort,
        cohort_label=data.cohort_label,
        cutoff=cutoff,
        data_version=data.data_version,
        source_expression=data.sources["expression"]["label"],
        source_survival=data.sources["survival"]["label"],
        endpoints=results,
    )
