"""Survival analysis over compact SurvScope data."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from .constants import ENDPOINTS, MONTH_DAYS
from .data import DataStore, GeneData
from .grouping import GroupingSpec, assign_groups, grouping_label, normalize_grouping
from .models import Curve, EndpointResult, SurvivalAnalysis
from .statistics import COX_MESSAGES, bh_fdr, cox_fit, kaplan_meier, km_timeline, logrank_test

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
    grouping: GroupingSpec | dict | None = None,
) -> SurvivalAnalysis:
    """Analyze one gene in one TCGA or CPTAC cohort.

    A numeric cutoff is interpreted as TPM. The special value ``"median"``
    applies the exact endpoint-specific median grouping recorded during the
    data build.
    """
    data_store = store or DataStore()
    gene_data = data_store.load_gene(gene, cohort)
    return analyze_gene_data(gene_data, cutoff=cutoff, grouping=grouping)


def analyze_gene_data(
    data: GeneData,
    cutoff: str | float = "median",
    *,
    grouping: GroupingSpec | dict | None = None,
) -> SurvivalAnalysis:
    spec = normalize_grouping(cutoff, grouping)

    tpm = data.expression_tpm
    results: dict[str, EndpointResult] = {}
    pvalues: list[float] = []
    for endpoint in ENDPOINTS:
        clinical = data.clinical["endpoints"][endpoint]
        time = _number_array(clinical["time"], dtype=float)
        event = _number_array(clinical["event"], dtype=float)
        valid = np.isfinite(tpm) & np.isfinite(time) & np.isin(event, [0, 1]) & (time > 0)
        indices = np.flatnonzero(valid)
        endpoint_time = time[valid]
        endpoint_event = event[valid].astype(int)
        endpoint_tpm = tpm[valid]

        low_mask, high_mask, lower_threshold, upper_threshold = assign_groups(
            endpoint_tpm,
            indices,
            data.medians.get(endpoint, {}),
            spec,
        )
        included = low_mask | high_mask
        eligible_n = len(endpoint_time)
        excluded_middle = int(np.sum(~included))
        endpoint_time = endpoint_time[included]
        endpoint_event = endpoint_event[included]
        high = high_mask[included]
        low = ~high
        endpoint_cutoff = lower_threshold if lower_threshold == upper_threshold else np.nan

        warning = ""
        if len(endpoint_time) == 0:
            warning = "No endpoint-valid samples."
        elif not bool(np.any(low)) or not bool(np.any(high)):
            warning = "The cutoff leaves one expression group empty."
        elif int(np.sum(endpoint_event[low])) == 0 or int(np.sum(endpoint_event[high])) == 0:
            warning = "At least one group has no observed events; inferential statistics may be NA."

        chi2, pvalue = logrank_test(endpoint_time, endpoint_event, high.astype(int))
        hazard_ratio, cox_p, cox_status = cox_fit(
            endpoint_time,
            endpoint_event,
            high.astype(int),
        )
        if cox_status != "ok" and len(endpoint_time):
            warning = COX_MESSAGES[cox_status]
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
                timeline=km_timeline(endpoint_time[low], endpoint_event[low]),
            ),
            high=Curve(
                x_months=high_x / MONTH_DAYS,
                survival=high_y,
                n=int(np.sum(high)),
                events=int(np.sum(endpoint_event[high])),
                timeline=km_timeline(endpoint_time[high], endpoint_event[high]),
            ),
            warning=warning,
            eligible_n=eligible_n,
            excluded_middle=excluded_middle,
            lower_threshold=lower_threshold,
            upper_threshold=upper_threshold,
            cox_status=cox_status,
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
        cutoff="median" if spec.kind == "median" else spec.threshold,
        data_version=data.data_version,
        source_expression=data.sources["expression"]["label"],
        source_survival=data.sources["survival"]["label"],
        endpoints=results,
        grouping=spec.to_dict(),
        grouping_label=grouping_label(spec),
    )
