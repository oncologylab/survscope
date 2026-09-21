# Statistical methods

For help using the website, start with the [user guide](user-guide.md). This page specifies the calculations shared by Python and JavaScript, and how they are checked against R.

## Patients and outcomes

TCGA uses GDC STAR TPM expression and PanCanAtlas TCGA-CDR outcomes. Solid tumors use primary sample code `01`; LAML uses primary peripheral-blood cancer code `03`. When several eligible primary columns belong to one case, the first stable matrix column is used. CPTAC uses GDC primary-specimen metadata and GDC OS donor records; its matching, censoring, and exclusions are specified in [CPTAC methods](cptac.md#survival-and-sample-rules). Cohorts are never pooled.

An endpoint includes a patient only when expression and time are finite, time is strictly positive, and event is exactly 0 or 1. Each endpoint is filtered independently before forming expression groups. This produces endpoint-specific thresholds and counts. TCGA quality labels reproduce TCGA-CDR Table 3; CPTAC has a separate follow-up caution and supports OS only.

## Expression groups

All options make two groups. They depend on expression among endpoint-valid patients, without searching survival statistics for a favorable cutoff.

| Grouping specification | Lower group | Higher group |
| --- | --- | --- |
| `median` | Original TPM ≤ stored endpoint median | Original TPM > stored endpoint median |
| `mean` | Decoded TPM ≤ arithmetic mean TPM | Decoded TPM > arithmetic mean TPM |
| `tpm`, `threshold=c` | Decoded TPM ≤ c | Decoded TPM > c |
| `percentile`, `percentile=p` | Decoded TPM ≤ Q(p/100) | Decoded TPM > Q(p/100) |
| `percentile_groups`, `lowerPercent=l`, `upperPercent=u` | Decoded TPM ≤ Q(l/100) | Decoded TPM > Q(1−u/100) |

`Q` is [R type-7 linear-interpolated quantile](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html). Equal expression values stay together. Groups therefore need not have their nominal sizes, and can be empty. Custom percentile comparisons omit patients between the two thresholds and report `eligible_n`/`eligibleN` and `excluded_middle`/`excludedMiddle`. Percentages must be strictly between 0 and 100 and sum to at most 100. Complementary percentile groups normalize to one percentile split; 50th-percentile comparisons normalize to the exact original median path. The website's quarters and thirds presets use 25/25 and (100/3)/(100/3), respectively.

The compact data encode `round(1000 * log2(TPM+1))`. Nonmedian comparisons use the decoded TPM, including its quantization. The mean uses compensated summation. Quantiles use the same one-based index and interpolation operation order as R: algebraically equivalent interpolation can round to opposite sides of an observed value and change a tie's membership. The original median uses stored unquantized cutoffs and sparse XOR membership corrections, preserving the existing SRD5A1/PAAD reference exactly. It is not reconstructed from quantized TPM alone.

Old `cutoff="median"` and numeric-TPM API calls and URL links remain supported. New APIs accept `GroupingSpec`; JSON exports add normalized grouping, resolved endpoint thresholds, included/excluded counts, and statistical method version `1`.

## Survival estimates and tests

Kaplan–Meier survival is the product over event times of `(1 − d/n)`, with patients censored at the event time still included in that risk set. Curves remain constant between events and extend through the last observed time. Censor-only times appear in the aggregate timeline used for overlays. Days are converted to months by division by 30.4375, or to years by division by 365.25.

The two-sided, one-degree-of-freedom log-rank test uses the hypergeometric variance for tied events. Its p-value is the chi-square upper-tail probability. The browser uses a high-accuracy complementary error function rather than the previous short approximation.

The unadjusted binary Cox proportional-hazards model compares higher with lower expression and uses **Breslow** ties. Cox p-values use the two-sided normal Wald test. R's usual Efron default must therefore be changed explicitly to `ties="breslow"` when comparing results. See [`coxph`](https://stat.ethz.ch/R-manual/R-devel/library/survival/html/coxph.html).

To preserve the published PAAD values, the Python Cox solver retains SciPy's bounded minimization, initially on log-HR [−8, 8], with `xatol=1e-5` and a maximum of 500 iterations. JavaScript uses the matching solver and NumPy reduction order. Before fitting, both implementations check mixed-group event risk sets for identifiability and separation. A finite optimum outside the initial interval triggers bracket expansion, up to ±64. Empty groups, no events, no information, separation, or failed convergence return `NA` with a reason; a boundary value is not presented as an estimated HR. Complete separation can occur even when both groups have events.

Benjamini–Hochberg q-values adjust only finite log-rank p-values across the four outcomes for the current gene, cohort, and grouping. Hiding a panel does not change that family. CPTAC has one available endpoint, so its OS q-value equals its p-value. This adjustment does **not** account for exploration across genes, cohorts, or grouping choices.

## Confidence bands, censor marks, and risk tables

The optional confidence bands are pointwise Greenwood/log intervals, matching [`survfit(conf.type="log")`](https://stat.ethz.ch/R-manual/R-devel/library/survival/html/survfit.formula.html). At each event time, the variance of log survival accumulates `d / (n * (n−d))`. Bounds are `S * exp(±z * sqrt(variance))`, with the upper bound capped at 1. Supported levels are 90%, 95%, and 99%; 95% is the initial selection. At zero survival the log interval is undefined, as in R, and no finite interval is drawn beyond that point. These are not simultaneous confidence bands or HR intervals.

Censor marks use survival after any events at the same time. Number-at-risk tables include patients with observed times ≥ the displayed time, matching [R's “just before time” convention](https://stat.ethz.ch/R-manual/R-devel/library/survival/html/summary.survfit.html). Zoom, axis limits, time-unit changes, and risk-table tick choices affect display only. They never remove patients, refit statistics, or alter multiplicity adjustment.

## Validation

[`scripts/validate_statistics.py`](../scripts/validate_statistics.py) executes Python, bundled browser TypeScript in Node, and an independent R reference. The reference independently decodes expression, filters endpoints, assigns groups, and runs `survfit`, `survdiff`, `coxph`, and `p.adjust`. It compares individual group indices only in temporary validation memory/files; published reports contain numerical differences and provenance, not patient records.

The pinned R `survival` reference is **3.8-13**, upstream commit `ed1a6b249fa714ccb9169faea63ddafd1addb774`, with a verified source archive checksum. R, jsonlite, Python, NumPy, SciPy, and Node versions and calculation-source hashes are recorded in each report. The reference uses `timefix=FALSE` for KM/Cox. In this R release an explicit `survdiff(timefix=FALSE)` leaks into `model.frame`; for log-rank only, integer ranks with identical ranks for exactly tied times avoid near-tie coalescing while preserving every risk set. This workaround does not change observed event ordering or ties.

The regular suite tests every gene in the bundled TCGA and CPTAC fixtures, eight grouping specifications, and ten synthetic cases (ties and censoring, separation, no information, no events, one patient, constant expression, invalid rows, null effects, and closely spaced times). It performs **744 endpoint comparisons**. Deployment additionally checks **5,256 endpoint comparisons**: SRD5A1, TP53, and EGFR across all **51 production cohorts**, eight grouping specifications, and the synthetic cases. This is broad regression coverage, not an exhaustive test of every gene/cutoff combination.

The acceptance limits are:

| Quantity | JavaScript versus Python | Independent R versus Python |
| --- | ---: | ---: |
| Group membership; patient/event/risk/censor counts | Exact | Exact |
| KM survival, Greenwood variance, confidence bounds, log-rank statistic/p, BH q | Absolute error ≤ 1e-10 | Absolute error ≤ 1e-10 |
| Expression thresholds | Error ≤ 1e-10 × max(1, abs(threshold)) | Same |
| Log hazard ratio | Absolute error ≤ 2e-8 | Absolute error ≤ 1e-5 |
| Cox Wald p | Absolute error ≤ 1e-7 | Absolute error ≤ 1e-4 |

Undefined estimates must agree in availability. The R Cox tolerance is deliberately distinct: preserving the original bounded-solver reference means it will not match every final decimal of R's more tightly converged estimate. In the full release check, all counts and memberships matched exactly; maximum log-HR differences were 2.59e-9 (JavaScript) and 2.14e-6 (R), and maximum Cox p-value differences were 4.17e-9 and 7.89e-6, respectively. The [validation report](validation-2026.09.21.json) records observed errors and coverage.

The original SRD5A1/PAAD tests retain its endpoint sample/event counts, exact median membership, p/q/HR values, blue/red default, and 6.8-inch figure. Browser checks also exercise direct editing, undo, projects, optional overlays, physical SVG/PDF dimensions, PNG pixels, embedded fonts, small screens, and same-origin runtime requests. [Development instructions](development.md) explain how to reproduce these checks.
