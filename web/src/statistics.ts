import { ENDPOINTS } from "./types";
import type {
  Curve,
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
    n: time.length,
    events: event.reduce((sum, value) => sum + value, 0),
  };
}

function erfc(value: number): number {
  const z = Math.abs(value);
  const t = 1 / (1 + 0.5 * z);
  const polynomial =
    t *
    (1.00002368 +
      t *
        (0.37409196 +
          t *
            (0.09678418 +
              t *
                (-0.18628806 +
                  t *
                    (0.27886807 +
                      t *
                        (-1.13520398 +
                          t *
                            (1.48851587 +
                              t * (-0.82215223 + t * 0.17087277))))))));
  const answer =
    t *
    Math.exp(-z * z - 1.26551223 + polynomial);
  return value >= 0 ? answer : 2 - answer;
}

export function logrank(
  time: number[],
  event: number[],
  high: boolean[],
): [number, number] {
  if (!high.some(Boolean) || high.every(Boolean)) return [Number.NaN, Number.NaN];
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

function coxTerms(
  beta: number,
  time: number[],
  event: number[],
  high: boolean[],
): [number, number] {
  const eventTimes = Array.from(
    new Set(time.filter((_, index) => event[index] === 1)),
  ).sort((a, b) => a - b);
  let score = high.reduce(
    (sum, value, index) => sum + (event[index] === 1 && value ? 1 : 0),
    0,
  );
  let information = 0;
  for (const eventTime of eventTimes) {
    const deaths = time.filter(
      (value, index) => value === eventTime && event[index] === 1,
    ).length;
    let weightSum = 0;
    let weightedX = 0;
    let weightedX2 = 0;
    for (let index = 0; index < time.length; index += 1) {
      if (time[index] < eventTime) continue;
      const x = high[index] ? 1 : 0;
      const weight = Math.exp(beta * x);
      weightSum += weight;
      weightedX += weight * x;
      weightedX2 += weight * x * x;
    }
    const mean = weightedX / weightSum;
    score -= deaths * mean;
    information += deaths * (weightedX2 / weightSum - mean * mean);
  }
  return [score, information];
}

export function coxBinary(
  time: number[],
  event: number[],
  high: boolean[],
): [number, number] {
  if (
    !high.some(Boolean) ||
    high.every(Boolean) ||
    event.reduce((sum, value) => sum + value, 0) === 0
  ) {
    return [Number.NaN, Number.NaN];
  }
  let beta = 0;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const [score, information] = coxTerms(beta, time, event, high);
    if (!(information > 0)) return [Number.NaN, Number.NaN];
    const step = Math.max(-1, Math.min(1, score / information));
    beta = Math.max(-8, Math.min(8, beta + step));
    if (Math.abs(step) < 1e-10) break;
  }
  const [, information] = coxTerms(beta, time, event, high);
  if (!(information > 0)) return [Number.NaN, Number.NaN];
  const z = beta * Math.sqrt(information);
  return [Math.exp(beta), erfc(Math.abs(z) / Math.SQRT2)];
}

export function bhFdr(values: number[]): number[] {
  const output = values.map(() => Number.NaN);
  const valid = values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => Number.isFinite(value) && value >= 0 && value <= 1)
    .sort((a, b) => a.value - b.value);
  let running = 1;
  for (let rank = valid.length - 1; rank >= 0; rank -= 1) {
    running = Math.min(running, (valid[rank].value * valid.length) / (rank + 1));
    output[valid[rank].index] = Math.max(0, Math.min(1, running));
  }
  return output;
}

function analyzeEndpoint(
  data: GeneData,
  endpoint: Endpoint,
  cutoff: "median" | number,
): EndpointResult {
  const clinical = data.clinical.endpoints[endpoint];
  const tpm = Array.from(data.expression, (encoded) =>
    encoded === data.missing ? Number.NaN : 2 ** (encoded / data.scale) - 1,
  );
  const validIndices = tpm
    .map((value, index) => ({ value, index }))
    .filter(
      ({ value, index }) =>
        Number.isFinite(value) &&
        finite(clinical.time[index]) &&
        finite(clinical.event[index]) &&
        (clinical.time[index] as number) > 0,
    )
    .map(({ index }) => index);
  const time = validIndices.map((index) => clinical.time[index] as number);
  const event = validIndices.map((index) => clinical.event[index] as number);
  const endpointTpm = validIndices.map((index) => tpm[index]);
  const median = data.gene.medians[endpoint];
  const cutoffTpm =
    cutoff === "median"
      ? (median.cutoff_tpm ?? Number.NaN)
      : cutoff;
  const flipSet = new Set(cutoff === "median" ? median.flips : []);
  const high = validIndices.map((globalIndex, localIndex) => {
    const encodedHigh = endpointTpm[localIndex] > cutoffTpm;
    return flipSet.has(globalIndex) ? !encodedHigh : encodedHigh;
  });
  const lowTime = time.filter((_, index) => !high[index]);
  const lowEvent = event.filter((_, index) => !high[index]);
  const highTime = time.filter((_, index) => high[index]);
  const highEvent = event.filter((_, index) => high[index]);
  const [chi2, p] = logrank(time, event, high);
  const [hr, coxP] = coxBinary(time, event, high);
  let warning = "";
  if (time.length === 0) warning = "No endpoint-valid samples.";
  else if (lowTime.length === 0 || highTime.length === 0)
    warning = "The cutoff leaves one expression group empty.";
  else if (
    lowEvent.reduce((sum, value) => sum + value, 0) === 0 ||
    highEvent.reduce((sum, value) => sum + value, 0) === 0
  )
    warning = "At least one group has no observed events.";
  return {
    endpoint,
    quality: clinical.quality,
    qualityNote: clinical.quality_note,
    n: time.length,
    nLow: lowTime.length,
    nHigh: highTime.length,
    events: event.reduce((sum, value) => sum + value, 0),
    eventsLow: lowEvent.reduce((sum, value) => sum + value, 0),
    eventsHigh: highEvent.reduce((sum, value) => sum + value, 0),
    cutoffTpm,
    logrankChi2: chi2,
    logrankP: p,
    logrankQ: Number.NaN,
    coxHr: hr,
    coxP,
    low: kaplanMeier(lowTime, lowEvent),
    high: kaplanMeier(highTime, highEvent),
    warning,
  };
}

export function analyzeGeneData(
  data: GeneData,
  cutoff: "median" | number,
): SurvivalAnalysis {
  const endpointResults = ENDPOINTS.map((endpoint) =>
    analyzeEndpoint(data, endpoint, cutoff),
  );
  const adjusted = bhFdr(endpointResults.map((result) => result.logrankP));
  endpointResults.forEach((result, index) => {
    result.logrankQ = adjusted[index];
  });
  return {
    gene: data.gene.symbol,
    ensembl: data.gene.ensembl,
    cohort: data.cohort,
    cohortLabel: data.cohortLabel,
    cutoff,
    dataVersion: data.dataVersion,
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
