"""Small, auditable survival-statistics implementation."""

from __future__ import annotations

import math

import numpy as np
from scipy import optimize, stats

from .constants import MONTH_DAYS

COX_MESSAGES = {
    "empty_group": "The comparison leaves one expression group empty.",
    "no_events": "No events were observed; a hazard ratio cannot be estimated.",
    "no_information": (
        "The groups have no overlapping event risk sets; the hazard ratio is unavailable."
    ),
    "separation": (
        "The groups are completely separated at event times; no finite hazard ratio exists."
    ),
    "not_converged": "The Cox model did not converge; the hazard ratio is unavailable.",
}


def kaplan_meier(time: np.ndarray, event: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return post-step Kaplan-Meier coordinates in the input time units."""
    time = np.asarray(time, dtype=float)
    event = np.asarray(event, dtype=int)
    order = np.argsort(time, kind="stable")
    time = time[order]
    event = event[order]
    xs = [0.0]
    ys = [1.0]
    survival = 1.0
    for event_time in np.unique(time[event == 1]):
        at_risk = int(np.sum(time >= event_time))
        events = int(np.sum((time == event_time) & (event == 1)))
        if at_risk <= 0:
            continue
        updated = survival * (1.0 - events / at_risk)
        xs.extend([float(event_time), float(event_time)])
        ys.extend([survival, updated])
        survival = updated
    if len(time):
        xs.append(float(np.max(time)))
        ys.append(survival)
    return np.asarray(xs), np.asarray(ys)


def logrank_test(
    time: np.ndarray,
    event: np.ndarray,
    high: np.ndarray,
) -> tuple[float, float]:
    """Two-sided one-degree-of-freedom log-rank test."""
    time = np.asarray(time, dtype=float)
    event = np.asarray(event, dtype=int)
    high = np.asarray(high, dtype=int)
    if len(time) == 0 or len(np.unique(high)) < 2:
        return np.nan, np.nan

    observed_high = 0.0
    expected_high = 0.0
    variance = 0.0
    for event_time in np.unique(time[event == 1]):
        risk = time >= event_time
        deaths_at_time = (time == event_time) & (event == 1)
        n = int(np.sum(risk))
        n_high = int(np.sum(risk & (high == 1)))
        deaths = int(np.sum(deaths_at_time))
        deaths_high = int(np.sum(deaths_at_time & (high == 1)))
        if n <= 0:
            continue
        observed_high += deaths_high
        expected_high += deaths * n_high / n
        if n > 1:
            variance += deaths * (n - deaths) * n_high * (n - n_high) / (n * n * (n - 1))
    if variance <= 0 or not np.isfinite(variance):
        return np.nan, np.nan
    chi2 = (observed_high - expected_high) ** 2 / variance
    return float(chi2), float(stats.chi2.sf(chi2, 1))


def cox_binary(
    time: np.ndarray,
    event: np.ndarray,
    high: np.ndarray,
) -> tuple[float, float]:
    """Binary Cox proportional-hazards estimate using Breslow ties."""
    hr, pvalue, _ = cox_fit(time, event, high)
    return hr, pvalue


def cox_fit(
    time: np.ndarray,
    event: np.ndarray,
    high: np.ndarray,
) -> tuple[float, float, str]:
    """Legacy Breslow estimate with explicit identifiability and convergence checks."""
    time = np.asarray(time, dtype=float)
    event = np.asarray(event, dtype=int)
    x = np.asarray(high, dtype=float)
    if len(time) == 0 or len(np.unique(x)) < 2:
        return np.nan, np.nan, "empty_group"
    if int(event.sum()) == 0:
        return np.nan, np.nan, "no_events"
    event_times = np.unique(time[event == 1])
    risk_sets = []
    mixed_low = mixed_high = 0
    for event_time in event_times:
        risk = time >= event_time
        deaths = (time == event_time) & (event == 1)
        n_high = int(np.sum(risk & (x == 1)))
        n_low = int(np.sum(risk & (x == 0)))
        d_high = int(np.sum(deaths & (x == 1)))
        d = int(np.sum(deaths))
        risk_sets.append((n_low, n_high, d, d_high))
        if n_low and n_high:
            mixed_low += d - d_high
            mixed_high += d_high
    # Limiting scores at beta = +/- infinity: this also detects separation
    # when BOTH groups have events, but their event risk sets are separated.
    if mixed_low + mixed_high == 0:
        return np.nan, np.nan, "no_information"
    if mixed_low == 0 or mixed_high == 0:
        return np.nan, np.nan, "separation"

    def score(beta: float) -> float:
        weight = math.exp(beta)
        return sum(dh - d * nh * weight / (nl + nh * weight) for nl, nh, d, dh in risk_sets)

    bound = 8
    while not (score(-bound) > 0 and score(bound) < 0):
        bound *= 2
        if bound > 64:
            return np.nan, np.nan, "not_converged"

    def neg_loglik(beta: float) -> float:
        bx = beta * x
        total = float(np.sum(bx[event == 1]))
        for event_time in event_times:
            deaths = int(np.sum((time == event_time) & (event == 1)))
            risk_sum = float(np.sum(np.exp(bx[time >= event_time])))
            if risk_sum <= 0:
                return np.inf
            total -= deaths * math.log(risk_sum)
        return -total

    fit = optimize.minimize_scalar(
        neg_loglik,
        bounds=(-bound, bound),
        method="bounded",
        options={"xatol": 1e-5, "maxiter": 500},
    )
    if not fit.success or not np.isfinite(fit.x):
        return np.nan, np.nan, "not_converged"
    beta = float(fit.x)
    bx = beta * x
    hessian = 0.0
    for event_time in event_times:
        deaths = int(np.sum((time == event_time) & (event == 1)))
        risk = time >= event_time
        weights = np.exp(bx[risk])
        weight_sum = float(np.sum(weights))
        if weight_sum <= 0:
            return np.nan, np.nan, "not_converged"
        weighted_mean = float(np.sum(weights * x[risk]) / weight_sum)
        weighted_second = float(np.sum(weights * x[risk] * x[risk]) / weight_sum)
        hessian -= deaths * (weighted_second - weighted_mean * weighted_mean)
    if hessian >= 0 or not np.isfinite(hessian):
        return np.nan, np.nan, "not_converged"
    standard_error = math.sqrt(-1.0 / hessian)
    z_score = beta / standard_error
    return math.exp(beta), float(2 * stats.norm.sf(abs(z_score))), "ok"


def km_timeline(time: np.ndarray, event: np.ndarray) -> list[dict]:
    """Aggregate KM risk sets, including censor-only times; no subject records."""
    time = np.asarray(time, dtype=float)
    event = np.asarray(event, dtype=int)
    survival = 1.0
    greenwood = 0.0
    points = []
    for at in np.unique(time):
        n = int(np.sum(time >= at))
        d = int(np.sum((time == at) & (event == 1)))
        censored = int(np.sum((time == at) & (event == 0)))
        if d:
            survival *= 1.0 - d / n
            greenwood = greenwood + d / (n * (n - d)) if n > d else np.inf
        points.append(
            {
                "timeMonths": float(at / MONTH_DAYS),
                "survival": survival,
                "atRisk": n,
                "events": d,
                "censored": censored,
                "greenwood": float(greenwood) if np.isfinite(greenwood) else None,
            }
        )
    return points


def confidence_bounds(
    survival: float,
    greenwood: float | None,
    level: float = 0.95,
) -> tuple[float, float]:
    """Pointwise Greenwood/log intervals, matching R survfit(conf.type='log')."""
    zvalues = {0.90: 1.6448536269514722, 0.95: 1.959963984540054, 0.99: 2.5758293035489004}
    if level not in zvalues:
        raise ValueError("Confidence level must be 0.90, 0.95, or 0.99.")
    if greenwood is None or not np.isfinite(greenwood) or survival <= 0:
        return np.nan, np.nan
    margin = zvalues[level] * math.sqrt(greenwood)
    return survival * math.exp(-margin), min(1.0, survival * math.exp(margin))


def bh_fdr(values: list[float]) -> list[float]:
    """Benjamini-Hochberg adjustment, ignoring non-finite values."""
    output = np.full(len(values), np.nan, dtype=float)
    valid_indices = [
        index for index, value in enumerate(values) if np.isfinite(value) and 0 <= value <= 1
    ]
    if not valid_indices:
        return output.tolist()
    pvalues = np.asarray([values[index] for index in valid_indices], dtype=float)
    order = np.argsort(pvalues, kind="stable")
    ranked = pvalues[order]
    count = len(ranked)
    adjusted = ranked * count / np.arange(1, count + 1)
    adjusted = np.minimum.accumulate(adjusted[::-1])[::-1]
    adjusted = np.clip(adjusted, 0, 1)
    restored = np.empty_like(adjusted)
    restored[order] = adjusted
    for source_index, value in zip(valid_indices, restored, strict=True):
        output[source_index] = value
    return output.tolist()


def format_p(value: float) -> str:
    if not np.isfinite(value):
        return "NA"
    if value < 0.001:
        return f"{value:.1e}"
    if value < 0.01:
        return f"{value:.4f}".rstrip("0")
    if value < 0.1:
        return f"{value:.3f}".rstrip("0")
    return f"{value:.2f}"
