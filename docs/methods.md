# Statistical methods

For each expression sample, SurvScope uses the corresponding TCGA-CDR case and
endpoint when expression, time, and event are finite and time is greater than
zero. Solid-tumor cohorts use TCGA sample code `01` (Primary Solid Tumor).
LAML uses code `03` (Primary Blood Derived Cancer - Peripheral Blood), following
the GDC sample-type code table. If a matrix contains more than one eligible
primary-cancer column for a case, the first stable matrix column is used.

Median grouping is recomputed within the valid sample set for each endpoint.
Values strictly greater than the median TPM are High; ties and values below the
cutoff are Low. A numeric custom cutoff is interpreted as TPM.

The Kaplan–Meier estimator changes at observed event times. Time in the figure
is displayed as days divided by 30.4375. The log-rank test uses one degree of
freedom. The hazard ratio is from an unadjusted binary Cox proportional-hazards
model comparing High with Low and uses Breslow handling for tied event times.
The four finite endpoint log-rank p-values are adjusted within the plotted gene
and cutoff using Benjamini–Hochberg.

If a cutoff leaves a group empty, an endpoint has no valid rows, an event group
has no events, or a Cox estimate is not identifiable, SurvScope draws any
available KM curve and reports the affected inferential statistic as `NA`.
