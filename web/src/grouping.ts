import type { GroupingSpec, MedianRecord } from "./types";

export type GroupingInput = "median" | number | GroupingSpec;

export function normalizeGrouping(input: GroupingInput): GroupingSpec {
  const spec: GroupingSpec =
    input === "median"
      ? { kind: "median" }
      : typeof input === "number"
        ? { kind: "tpm", threshold: input }
        : input;
  if (!spec || typeof spec !== "object")
    throw new Error("Choose a valid comparison.");
  const keys: Record<string, string[]> = {
    median: ["kind"],
    mean: ["kind"],
    tpm: ["kind", "threshold"],
    percentile: ["kind", "percentile"],
    extremes: ["kind", "lowerPercent", "upperPercent"],
  };
  if (
    !keys[spec.kind] ||
    Object.keys(spec).some((key) => !keys[spec.kind].includes(key))
  ) {
    throw new Error(
      "Grouping parameters do not match the selected comparison.",
    );
  }
  if (
    spec.kind === "tpm" &&
    (!Number.isFinite(spec.threshold) || spec.threshold < 0)
  ) {
    throw new Error("TPM threshold must be a finite, non-negative number.");
  }
  if (spec.kind === "percentile") {
    if (
      !Number.isFinite(spec.percentile) ||
      !(spec.percentile > 0 && spec.percentile < 100)
    ) {
      throw new Error("Percentile must be greater than 0 and less than 100.");
    }
    if (spec.percentile === 50) return { kind: "median" };
  }
  if (spec.kind === "extremes") {
    const { lowerPercent: lo, upperPercent: hi } = spec;
    if (
      !Number.isFinite(lo) ||
      !Number.isFinite(hi) ||
      !(lo > 0 && hi > 0 && lo < 100 && hi < 100 && lo + hi <= 100)
    ) {
      throw new Error(
        "Group percentages must be positive and total at most 100.",
      );
    }
    if (lo + hi === 100)
      return normalizeGrouping({ kind: "percentile", percentile: lo });
  }
  return spec;
}

export function groupingLabel(spec: GroupingSpec): string {
  if (spec.kind === "median") return "Median expression";
  if (spec.kind === "mean") return "Mean (average) expression";
  if (spec.kind === "tpm") return `Expression threshold: ${spec.threshold} TPM`;
  if (spec.kind === "percentile")
    return `${spec.percentile}th percentile split`;
  return `Lowest ${Number(spec.lowerPercent.toPrecision(4))}% vs highest ${Number(spec.upperPercent.toPrecision(4))}%`;
}

export function quantile(values: number[], probability: number): number {
  if (!values.length) return Number.NaN;
  const ordered = [...values].sort((a, b) => a - b);
  // Match R type-7's one-based index and weighted-average operation order.
  const position = 1 + (ordered.length - 1) * probability;
  const lower = Math.floor(position),
    upper = Math.ceil(position),
    fraction = position - lower;
  const a = ordered[lower - 1],
    b = ordered[upper - 1];
  return fraction === 0 || a === b ? a : (1 - fraction) * a + fraction * b;
}

export function assignGroups(
  tpm: number[],
  indices: number[],
  median: MedianRecord,
  spec: GroupingSpec,
) {
  let lower = spec.kind === "tpm" ? spec.threshold : Number.NaN;
  let upper = lower;
  if (!tpm.length) return { low: [], high: [], lower, upper };
  if (spec.kind === "median") {
    lower = median.cutoff_tpm ?? quantile(tpm, 0.5);
    const flips = new Set(median.flips);
    const high = tpm.map((x, i) => x > lower !== flips.has(indices[i]));
    return { low: high.map((x) => !x), high, lower, upper: lower };
  }
  if (spec.kind === "mean") {
    let total = 0,
      correction = 0;
    for (const value of tpm) {
      const updated = total + value;
      correction +=
        Math.abs(total) >= Math.abs(value)
          ? total - updated + value
          : value - updated + total;
      total = updated;
    }
    lower = upper = (total + correction) / tpm.length;
  } else if (spec.kind === "percentile") {
    lower = upper = quantile(tpm, spec.percentile / 100);
  } else if (spec.kind === "extremes") {
    lower = quantile(tpm, spec.lowerPercent / 100);
    upper = quantile(tpm, 1 - spec.upperPercent / 100);
  }
  return {
    low: tpm.map((x) => x <= lower),
    high: tpm.map((x) => x > upper),
    lower,
    upper,
  };
}

export function groupingFromQuery(params: URLSearchParams): GroupingSpec {
  const kind = params.get("grouping");
  const number = (key: string) => {
    const value = params.get(key);
    if (
      value === null ||
      value.trim() === "" ||
      !Number.isFinite(Number(value))
    ) {
      throw new Error(`A valid ${key} is required.`);
    }
    return Number(value);
  };
  if (kind === "mean") return { kind };
  if (kind === "percentile")
    return normalizeGrouping({ kind, percentile: number("percentile") });
  if (kind === "extremes")
    return normalizeGrouping({
      kind,
      lowerPercent: number("lower"),
      upperPercent: number("upper"),
    });
  if (kind && kind !== "median")
    throw new Error("Unrecognized comparison in the link.");
  return normalizeGrouping(
    !params.has("cutoff") || params.get("cutoff") === "median"
      ? "median"
      : number("cutoff"),
  );
}

export function groupingQuery(spec: GroupingSpec): Record<string, string> {
  if (spec.kind === "median") return { cutoff: "median" };
  if (spec.kind === "tpm") return { cutoff: String(spec.threshold) };
  if (spec.kind === "mean") return { grouping: "mean" };
  if (spec.kind === "percentile")
    return { grouping: spec.kind, percentile: String(spec.percentile) };
  return {
    grouping: spec.kind,
    lower: String(spec.lowerPercent),
    upper: String(spec.upperPercent),
  };
}
