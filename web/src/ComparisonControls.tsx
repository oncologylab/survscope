import type { GroupingSpec } from "./types";
import { normalizeGrouping } from "./grouping";

export interface ComparisonDraft {
  mode:
    | "median"
    | "mean"
    | "percentile"
    | "quarters"
    | "thirds"
    | "extremes"
    | "tpm";
  threshold: string;
  percentile: string;
  lower: string;
  upper: string;
}
export function comparisonDraft(spec: GroupingSpec): ComparisonDraft {
  return {
    mode:
      spec.kind === "extremes" &&
      spec.lowerPercent === 25 &&
      spec.upperPercent === 25
        ? "quarters"
        : spec.kind,
    threshold: spec.kind === "tpm" ? String(spec.threshold) : "10",
    percentile: spec.kind === "percentile" ? String(spec.percentile) : "75",
    lower: spec.kind === "extremes" ? String(spec.lowerPercent) : "25",
    upper: spec.kind === "extremes" ? String(spec.upperPercent) : "25",
  };
}
export function draftGrouping(draft: ComparisonDraft): GroupingSpec {
  const n = (value: string) => {
    if (!value.trim() || !Number.isFinite(Number(value)))
      throw new Error("Enter a valid number for this comparison.");
    return Number(value);
  };
  switch (draft.mode) {
    case "median":
    case "mean":
      return { kind: draft.mode };
    case "quarters":
      return { kind: "extremes", lowerPercent: 25, upperPercent: 25 };
    case "thirds":
      return { kind: "extremes", lowerPercent: 100 / 3, upperPercent: 100 / 3 };
    case "percentile":
      return normalizeGrouping({
        kind: "percentile",
        percentile: n(draft.percentile),
      });
    case "tpm":
      return normalizeGrouping({ kind: "tpm", threshold: n(draft.threshold) });
    case "extremes":
      return normalizeGrouping({
        kind: "extremes",
        lowerPercent: n(draft.lower),
        upperPercent: n(draft.upper),
      });
  }
}
const descriptions: Record<ComparisonDraft["mode"], string> = {
  median:
    "Compare patients with lower and higher expression. Equal values can make the groups different sizes.",
  mean: "Compare expression at or below the average with expression above it.",
  percentile:
    "Choose where to divide patients into lower and higher expression groups.",
  quarters:
    "Compare the lowest 25% with the highest 25%. Leave the middle patients out of this comparison.",
  thirds:
    "Compare the lowest third with the highest third. Leave the middle third out.",
  extremes:
    "Choose how much of the lower and upper expression ranges to compare. Their total cannot exceed 100%.",
  tpm: "Enter a gene-expression threshold. TPM measures the relative abundance of a gene's RNA.",
};
export function ComparisonControls({
  draft,
  change,
  disabled,
}: {
  draft: ComparisonDraft;
  change: (draft: ComparisonDraft) => void;
  disabled: boolean;
}) {
  const field = (key: keyof ComparisonDraft, value: string) =>
    change({ ...draft, [key]: value });
  return (
    <fieldset className="comparison-control" disabled={disabled}>
      <label>
        <span>Compare expression groups</span>
        <select
          aria-label="Compare expression groups"
          value={draft.mode}
          onChange={(e) => field("mode", e.target.value)}
        >
          <option value="median">Median — lower vs higher halves</option>
          <option value="mean">Mean — split at the average</option>
          <option value="percentile">Choose a percentile</option>
          <option value="quarters">Lowest vs highest quarter</option>
          <option value="thirds">Lowest vs highest third</option>
          <option value="extremes">Custom extreme groups</option>
          <option value="tpm">Custom TPM threshold</option>
        </select>
      </label>
      <p className="help-text">{descriptions[draft.mode]}</p>
      {draft.mode === "tpm" && (
        <label>
          <span>Custom TPM cutoff</span>
          <input
            aria-label="Custom TPM cutoff"
            type="number"
            min="0"
            step="any"
            value={draft.threshold}
            onChange={(e) => field("threshold", e.target.value)}
          />
        </label>
      )}
      {draft.mode === "percentile" && (
        <label>
          <span>Percentile</span>
          <input
            aria-label="Percentile"
            type="number"
            min="0.1"
            max="99.9"
            step="any"
            value={draft.percentile}
            onChange={(e) => field("percentile", e.target.value)}
          />
        </label>
      )}
      {draft.mode === "extremes" && (
        <div className="property-grid">
          <label>
            <span>Lowest (%)</span>
            <input
              aria-label="Lowest (%)"
              type="number"
              min="0.1"
              max="99.9"
              step="any"
              value={draft.lower}
              onChange={(e) => field("lower", e.target.value)}
            />
          </label>
          <label>
            <span>Highest (%)</span>
            <input
              aria-label="Highest (%)"
              type="number"
              min="0.1"
              max="99.9"
              step="any"
              value={draft.upper}
              onChange={(e) => field("upper", e.target.value)}
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}
