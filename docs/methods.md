# Statistical methods

Python and JavaScript use the same calculations. Both are checked against R. For how to use the app, see the [user guide](user-guide.md).

## Patients and outcomes

| | TCGA | CPTAC |
| --- | --- | --- |
| Expression | GDC STAR TPM | GDC STAR TPM |
| Outcomes | PanCanAtlas TCGA-CDR | GDC OS donor records (OS only) |
| Samples | Code `01` primary tumor. LAML: code `03` blood. | [CPTAC rules](cptac.md#survival-and-sample-rules) |
| Quality labels | TCGA-CDR Table 3 | Follow-up caution |

If a case has several primary columns, the first stable column is used. Cohorts are never pooled.

A patient counts for an endpoint only if expression and time are finite, time > 0, and event is 0 or 1. Each endpoint is filtered on its own, so thresholds and counts can differ.

## Expression groups

Groups use only expression, never survival results.

| Grouping | Lower group | Higher group |
| --- | --- | --- |
| `median` | Original TPM ≤ stored endpoint median | Original TPM > stored endpoint median |
| `mean` | Decoded TPM ≤ mean TPM | Decoded TPM > mean TPM |
| `tpm`, `threshold=c` | Decoded TPM ≤ c | Decoded TPM > c |
| `percentile`, `percentile=p` | Decoded TPM ≤ Q(p/100) | Decoded TPM > Q(p/100) |
| `percentile_groups`, `lowerPercent=l`, `upperPercent=u` | Decoded TPM ≤ Q(l/100) | Decoded TPM > Q(1−u/100) |

- `Q` is the [R type-7 quantile](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html). It uses R's one-based index and order of operations, so ties fall the same way.
- Ties stay together. Groups can differ from their nominal size or be empty.
- `percentile_groups` drops the middle and reports `eligible_n`/`eligibleN` and `excluded_middle`/`excludedMiddle`.
- Each percent is above 0 and below 100. Their sum is at most 100. A sum of 100 becomes one percentile split. A 50th-percentile split uses `median`.
- App presets: quarters 25/25, thirds (100/3)/(100/3).
- Data store `round(1000 * log2(TPM+1))`. Non-median options use this decoded TPM. The mean uses compensated summation.
- The median uses stored full-precision cutoffs and sparse XOR corrections. This keeps the SRD5A1/PAAD reference exact.
- Old inputs still work: `cutoff="median"`, numeric TPM, old URLs, and `extremes` (read as `percentile_groups`). New APIs take `GroupingSpec`. JSON adds the grouping, thresholds, counts and method version `1`.

## Survival estimates and tests

| Method | Definition |
| --- | --- |
| Kaplan–Meier | Product over event times of `(1 − d/n)`. Patients censored at an event time stay in its risk set. |
| Log-rank | Two-sided, 1 df, hypergeometric variance for ties. p = chi-square upper tail. |
| Cox | Unadjusted, higher vs lower, Breslow ties, two-sided Wald p. In R use `ties="breslow"` ([`coxph`](https://stat.ethz.ch/R-manual/R-devel/library/survival/html/coxph.html)). |

Months = days / 30.4375. Years = days / 365.25.

Cox solver:

- Bounded minimization on log-HR [−8, 8], `xatol=1e-5`, at most 500 iterations (SciPy in Python, a matching solver in JavaScript). This keeps the published PAAD values.
- If the optimum is outside the range, it widens up to ±64.
- Risk sets are checked for separation first. Empty groups, no events, no information, separation or no convergence give `NA` with a reason.

## Adjusted q-values

Benjamini–Hochberg q-values are off by default. Turn them on with:

- Browser: **Properties → Survival details → Show adjusted q-value**
- Python: `show_q=True`
- CLI: `--show-q`

The family is the finite log-rank p-values of the four outcomes for one gene, cohort and grouping. Hiding a panel does not change it. With one p-value (CPTAC), q = p and q is not shown. JSON always has full-precision q. q does not correct for trying other genes, cohorts or groupings.

## Confidence bands, censor marks, and risk tables

- Bands are pointwise Greenwood/log intervals, as in [`survfit(conf.type="log")`](https://stat.ethz.ch/R-manual/R-devel/library/survival/html/survfit.formula.html). Variance of log S adds `d / (n * (n−d))` at each event. Bounds are `S * exp(±z * sqrt(variance))`, capped at 1. Levels: 90%, 95% (default), 99%. No band after S reaches 0.
- Censor marks sit at survival after events at the same time.
- Number at risk counts times ≥ the shown time, R's [“just before” rule](https://stat.ethz.ch/R-manual/R-devel/library/survival/html/summary.survfit.html).
- Zoom, axes and ticks change the display only. They never drop patients or refit.

## Validation

[`scripts/validate_statistics.py`](../scripts/validate_statistics.py) runs Python, the browser TypeScript in Node, and R. R decodes, filters, groups and runs `survfit`, `survdiff`, `coxph` and `p.adjust` on its own. Reports hold differences and versions, not patient data.

R reference:

- R `survival` 3.8-13, commit `ed1a6b249fa714ccb9169faea63ddafd1addb774`, checksum-verified.
- Reports record R, jsonlite, Python, NumPy, SciPy and Node versions and source hashes.
- KM and Cox use `timefix=FALSE`. In this R version `survdiff(timefix=FALSE)` leaks into `model.frame`. So log-rank uses integer time ranks (ties share a rank). Risk sets and ties are unchanged.

| Suite | Runs | Endpoint comparisons |
| --- | --- | ---: |
| Regular | All fixture genes, 8 groupings, 10 synthetic cases | 744 |
| Deployment | SRD5A1, TP53, EGFR × 51 cohorts, 8 groupings, synthetic cases | 5,256 |

Synthetic cases: ties and censoring, separation, no information, no events, one patient, constant expression, invalid rows, null effects, close times.

| Quantity | JavaScript vs Python | R vs Python |
| --- | ---: | ---: |
| Group membership; patient/event/risk/censor counts | Exact | Exact |
| KM survival, Greenwood variance, confidence bounds, log-rank statistic/p, BH q | Absolute error ≤ 1e-10 | Absolute error ≤ 1e-10 |
| Expression thresholds | Error ≤ 1e-10 × max(1, abs(threshold)) | Same |
| Log hazard ratio | Absolute error ≤ 2e-8 | Absolute error ≤ 1e-5 |
| Cox Wald p | Absolute error ≤ 1e-7 | Absolute error ≤ 1e-4 |

Undefined results must match. The R Cox limit is wider because the bounded solver is kept for the PAAD reference.

Latest full check: all counts and groups matched. Largest log-HR error: 2.59e-9 (JavaScript), 2.14e-6 (R). Largest Cox p error: 4.17e-9, 7.89e-6. See the [validation report](validation-2026.09.21.json).

SRD5A1/PAAD tests fix its counts, median groups, p/q/HR, blue/red default and 6.8-inch figure. To run the checks, see [development](development.md).
