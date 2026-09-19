import { ENDPOINTS } from "./types";
import { assignGroups, groupingLabel, normalizeGrouping } from "./grouping";
import type { GroupingInput } from "./grouping";
import { boundedMinimum, erfc, numpySum } from "./numeric";
import type {
  Curve,
  CoxStatus,
  GroupingSpec,
  RiskPoint,
  Endpoint,
  EndpointResult,
  GeneData,
  SurvivalAnalysis,
} from "./types";

const MONTH_DAYS = 30.4375;

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

export function kaplanMeier(time: number[], event: number[]): Curve {
  const order = time.map((_, index) => index).sort((a, b) => time[a] - time[b]);
  const orderedTime = order.map((index) => time[index]);
  const orderedEvent = order.map((index) => event[index]);
  const eventTimes = Array.from(
    new Set(orderedTime.filter((_, index) => orderedEvent[index] === 1)),
  ).sort((a, b) => a - b);
  const x = [0];
  const y = [1];
  let survival = 1;
  for (const eventTime of eventTimes) {
    const atRisk = orderedTime.filter((value) => value >= eventTime).length;
    const events = orderedTime.filter(
      (value, index) => value === eventTime && orderedEvent[index] === 1,
    ).length;
    if (atRisk <= 0) continue;
    const updated = survival * (1 - events / atRisk);
    x.push(eventTime / MONTH_DAYS, eventTime / MONTH_DAYS);
    y.push(survival, updated);
    survival = updated;
  }
  if (orderedTime.length) {
    x.push(Math.max(...orderedTime) / MONTH_DAYS);
    y.push(survival);
  }
  return {
    xMonths: x,
    survival: y,
    timeline: kmTimeline(time, event),
    n: time.length,
    events: event.reduce((sum, value) => sum + value, 0),
  };
}

export function logrank(
  time: number[],
  event: number[],
  high: boolean[],
): [number, number] {
  if (!high.some(Boolean) || high.every(Boolean))
    return [Number.NaN, Number.NaN];
  const eventTimes = Array.from(
    new Set(time.filter((_, index) => event[index] === 1)),
  ).sort((a, b) => a - b);
  let observedHigh = 0;
  let expectedHigh = 0;
  let variance = 0;
  for (const eventTime of eventTimes) {
    const risk = time.map((value) => value >= eventTime);
    const deaths = time.map(
      (value, index) => value === eventTime && event[index] === 1,
    );
    const n = risk.filter(Boolean).length;
    const nHigh = risk.filter((value, index) => value && high[index]).length;
    const d = deaths.filter(Boolean).length;
    const dHigh = deaths.filter((value, index) => value && high[index]).length;
    observedHigh += dHigh;
    expectedHigh += (d * nHigh) / n;
    if (n > 1) {
      variance += (d * (n - d) * nHigh * (n - nHigh)) / (n * n * (n - 1));
    }
  }
  if (!(variance > 0)) return [Number.NaN, Number.NaN];
  const chi2 = (observedHigh - expectedHigh) ** 2 / variance;
  return [chi2, erfc(Math.sqrt(chi2 / 2))];
}

export const COX_MESSAGES: Record<Exclude<CoxStatus, "ok">, string> = {
  empty_group: "The comparison leaves one expression group empty.",
  no_events: "No events were observed; a hazard ratio cannot be estimated.",
  no_information:
    "The groups have no overlapping event risk sets; the hazard ratio is unavailable.",
  separation:
    "The groups are completely separated at event times; no finite hazard ratio exists.",
  not_converged:
    "The Cox model did not converge; the hazard ratio is unavailable.",
};

export function coxBinary(
  time: number[],
  event: number[],
  high: boolean[],
): [number, number] {
  const { hr, p } = coxFit(time, event, high);
  return [hr, p];
}

export function coxFit(time: number[], event: number[], high: boolean[]) {
  const unavailable = (status: CoxStatus) => ({
    hr: Number.NaN,
    p: Number.NaN,
    status,
  });
  if (!high.some(Boolean) || high.every(Boolean))
    return unavailable("empty_group");
  if (!event.some((x) => x === 1)) return unavailable("no_events");
  const eventTimes = [...new Set(time.filter((_, i) => event[i] === 1))].sort(
    (a, b) => a - b,
  );
  let mixedLow = 0,
    mixedHigh = 0;
  const sets = eventTimes.map((t) => {
    const risk = time.flatMap((x, i) => (x >= t ? [i] : []));
    const deaths = time.flatMap((x, i) =>
      x === t && event[i] === 1 ? [i] : [],
    );
    const nh = risk.filter((i) => high[i]).length,
      nl = risk.length - nh;
    const dh = deaths.filter((i) => high[i]).length,
      d = deaths.length;
    if (nl && nh) {
      mixedHigh += dh;
      mixedLow += d - dh;
    }
    return { risk, nh, nl, dh, d };
  });
  if (mixedHigh + mixedLow === 0) return unavailable("no_information");
  if (!mixedHigh || !mixedLow) return unavailable("separation");
  const score = (beta: number) => {
    const w = Math.exp(beta);
    return sets.reduce(
      (sum, { nl, nh, d, dh }) => sum + dh - (d * nh * w) / (nl + nh * w),
      0,
    );
  };
  let bound = 8;
  while (!(score(-bound) > 0 && score(bound) < 0)) {
    bound *= 2;
    if (bound > 64) return unavailable("not_converged");
  }
  const objective = (beta: number) => {
    const bx = high.map((x) => beta * Number(x));
    let total = numpySum(bx.filter((_, i) => event[i] === 1));
    for (const { risk, d } of sets) {
      total -= d * Math.log(numpySum(risk.map((i) => Math.exp(bx[i]))));
    }
    return -total;
  };
  const beta = boundedMinimum(objective, -bound, bound);
  if (!Number.isFinite(beta)) return unavailable("not_converged");
  let hessian = 0;
  for (const { risk, d } of sets) {
    const weights = risk.map((i) => Math.exp(beta * Number(high[i])));
    const sum = numpySum(weights);
    const weighted = numpySum(weights.map((w, i) => w * Number(high[risk[i]])));
    const mean = weighted / sum;
    hessian -= d * (weighted / sum - mean * mean);
  }
  if (!(hessian < 0) || !Number.isFinite(hessian))
    return unavailable("not_converged");
  const z = beta / Math.sqrt(-1 / hessian);
  return {
    hr: Math.exp(beta),
    p: erfc(Math.abs(z) / Math.SQRT2),
    status: "ok" as CoxStatus,
  };
}

export function kmTimeline(time: number[], event: number[]): RiskPoint[] {
  let survival = 1,
    greenwood = 0;
  return [...new Set(time)]
    .sort((a, b) => a - b)
    .map((at) => {
      const n = time.filter((x) => x >= at).length;
      const d = time.filter((x, i) => x === at && event[i] === 1).length;
      const censored = time.filter((x, i) => x === at && event[i] === 0).length;
      if (d) {
        survival *= 1 - d / n;
        greenwood = n > d ? greenwood + d / (n * (n - d)) : Infinity;
      }
      return {
        timeMonths: at / MONTH_DAYS,
        survival,
        atRisk: n,
        events: d,
        censored,
        greenwood: Number.isFinite(greenwood) ? greenwood : null,
      };
    });
}

export function confidenceBounds(
  survival: number,
  greenwood: number | null,
  level = 0.95,
): [number, number] {
  const zs: Record<number, number> = {
    0.9: 1.6448536269514722,
    0.95: 1.959963984540054,
    0.99: 2.5758293035489004,
  };
  if (!zs[level])
    throw new Error("Confidence level must be 0.90, 0.95, or 0.99.");
  if (greenwood === null || !Number.isFinite(greenwood) || survival <= 0)
    return [NaN, NaN];
  const margin = zs[level] * Math.sqrt(greenwood);
  return [
    survival * Math.exp(-margin),
    Math.min(1, survival * Math.exp(margin)),
  ];
}

export function atRisk(curve: Curve, months: number): number {
  if (months <= 0) return curve.n;
  return (
    curve.timeline.find((point) => point.timeMonths >= months)?.atRisk ?? 0
  );
}

export function bhFdr(values: number[]): number[] {
  const output = values.map(() => Number.NaN);
  const valid = values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => Number.isFinite(value) && value >= 0 && value <= 1)
    .sort((a, b) => a.value - b.value);
  let running = 1;
  for (let rank = valid.length - 1; rank >= 0; rank -= 1) {
    running = Math.min(
      running,
      (valid[rank].value * valid.length) / (rank + 1),
    );
    output[valid[rank].index] = Math.max(0, Math.min(1, running));
  }
  return output;
}

export function prepareEndpoint(
  data: GeneData,
  endpoint: Endpoint,
  spec: GroupingSpec,
) {
  const clinical = data.clinical.endpoints[endpoint];
  const tpm = Array.from(data.expression, (encoded) =>
    encoded === data.missing ? NaN : 2 ** (encoded / data.scale) - 1,
  );
  const eligible = tpm.flatMap((value, i) =>
    Number.isFinite(value) &&
    finite(clinical.time[i]) &&
    (clinical.event[i] === 0 || clinical.event[i] === 1) &&
    clinical.time[i]! > 0
      ? [i]
      : [],
  );
  const assignment = assignGroups(
    eligible.map((i) => tpm[i]),
    eligible,
    data.gene.medians[endpoint],
    spec,
  );
  const included = eligible.flatMap((_, i) =>
    assignment.low[i] || assignment.high[i] ? [i] : [],
  );
  const indices = included.map((i) => eligible[i]);
  return {
    clinical,
    indices,
    time: indices.map((i) => clinical.time[i]!),
    event: indices.map((i) => clinical.event[i]!),
    high: included.map((i) => assignment.high[i]),
    eligibleN: eligible.length,
    excludedMiddle: eligible.length - included.length,
    lower: assignment.lower,
    upper: assignment.upper,
  };
}

function analyzeEndpoint(
  data: GeneData,
  endpoint: Endpoint,
  spec: GroupingSpec,
): EndpointResult {
  const {
    clinical,
    time,
    event,
    high,
    eligibleN,
    excludedMiddle,
    lower,
    upper,
  } = prepareEndpoint(data, endpoint, spec);
  const lowTime = time.filter((_, i) => !high[i]),
    lowEvent = event.filter((_, i) => !high[i]);
  const highTime = time.filter((_, i) => high[i]),
    highEvent = event.filter((_, i) => high[i]);
  const [chi2, p] = logrank(time, event, high);
  const fit = coxFit(time, event, high);
  return {
    endpoint,
    quality: clinical.quality,
    qualityNote: clinical.quality_note,
    n: time.length,
    nLow: lowTime.length,
    nHigh: highTime.length,
    events: event.reduce((sum, x) => sum + x, 0),
    eventsLow: lowEvent.reduce((sum, x) => sum + x, 0),
    eventsHigh: highEvent.reduce((sum, x) => sum + x, 0),
    cutoffTpm: lower === upper ? lower : NaN,
    lowerThreshold: lower,
    upperThreshold: upper,
    eligibleN,
    excludedMiddle,
    coxStatus: fit.status,
    logrankChi2: chi2,
    logrankP: p,
    logrankQ: NaN,
    coxHr: fit.hr,
    coxP: fit.p,
    low: kaplanMeier(lowTime, lowEvent),
    high: kaplanMeier(highTime, highEvent),
    warning: !time.length
      ? "No endpoint-valid samples."
      : fit.status === "ok"
        ? ""
        : COX_MESSAGES[fit.status],
  };
}

export function analyzeGeneData(
  data: GeneData,
  grouping: GroupingInput = "median",
): SurvivalAnalysis {
  const spec = normalizeGrouping(grouping);
  const endpointResults = ENDPOINTS.map((endpoint) =>
    analyzeEndpoint(data, endpoint, spec),
  );
  const adjusted = bhFdr(endpointResults.map((result) => result.logrankP));
  endpointResults.forEach((result, i) => {
    result.logrankQ = adjusted[i];
  });
  return {
    gene: data.gene.symbol,
    ensembl: data.gene.ensembl,
    cohort: data.cohort,
    cohortLabel: data.cohortLabel,
    sourceExpression: data.sourceExpression ?? "GDC STAR TPM",
    sourceSurvival: data.sourceSurvival ?? "PanCanAtlas TCGA-CDR",
    dataVersion: data.dataVersion,
    cutoff:
      spec.kind === "median"
        ? "median"
        : spec.kind === "tpm"
          ? spec.threshold
          : null,
    grouping: spec,
    groupingLabel: groupingLabel(spec),
    statisticsVersion: "1",
    endpoints: Object.fromEntries(
      endpointResults.map((result) => [result.endpoint, result]),
    ) as SurvivalAnalysis["endpoints"],
  };
}

export function formatP(value: number): string {
  if (!Number.isFinite(value)) return "NA";
  if (value < 0.001) return value.toExponential(1);
  if (value < 0.01) return value.toFixed(4).replace(/0+$/, "");
  if (value < 0.1) return value.toFixed(3).replace(/0+$/, "");
  return value.toFixed(2);
}
