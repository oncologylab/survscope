import { cohortDisplayName } from "./cohorts";
import type { ElementStyle, FigureSettings } from "./figure";
import type { Endpoint, EndpointResult, SurvivalAnalysis } from "./types";

export const isSharedGroupLabel = (id: string) =>
  id === "label.low" || id === "label.high";

export function legendEntry(
  settings: FigureSettings,
  result: EndpointResult,
  group: "low" | "high",
): { value: string; style: ElementStyle } {
  const shared = settings.elements[`label.${group}`] ?? {};
  const own = settings.elements[`label.${group}.${result.endpoint}`] ?? {};
  const name =
    shared.runs?.map((run) => run.text).join("") ??
    shared.text ??
    (group === "low" ? settings.lowLabel : settings.highLabel);
  const counts = ` n=${result[group].n}, e=${result[group].events}`;
  // Older projects store rich group names shared by every outcome. Keep those
  // names and formatting, but let a new entry override its complete display text.
  const { text: _text, runs: sharedRuns, ...sharedStyle } = shared;
  const inherited = {
    ...settings.elements[`legend.${result.endpoint}`],
    ...sharedStyle,
  };
  // The legend's translation belongs to its parent SVG group.
  delete inherited.dx;
  delete inherited.dy;
  const style = {
    ...inherited,
    ...own,
  };
  if (own.text === undefined && own.runs === undefined && sharedRuns)
    style.runs = [...sharedRuns, { text: counts }];
  return { value: name + counts, style };
}

export function defaultText(
  settings: FigureSettings,
  analysis: SurvivalAnalysis,
  id: string,
): string {
  const [kind, part, ep] = id.split(".");
  switch (kind) {
    case "label":
      if (ep)
        return legendEntry(
          settings,
          analysis.endpoints[ep as Endpoint],
          part as "low" | "high",
        ).value;
      return part === "low" ? settings.lowLabel : settings.highLabel;
    case "source":
      return `Expression: ${analysis.sourceExpression}; endpoints: ${analysis.sourceSurvival}`;
    case "grouping":
      return analysis.groupingLabel;
    case "xlabel":
      return settings.unit[0].toUpperCase() + settings.unit.slice(1);
    case "ylabel":
      return "Survival";
    case "annotation":
      return settings.annotations.find((a) => a.id === part)?.text ?? "";
    default:
      return part
        ? `${analysis.gene} ${part}`
        : `${analysis.gene} ${cohortDisplayName(analysis.cohort)} survival`;
  }
}

export function testedOutcomeCount(analysis: SurvivalAnalysis): number {
  return Object.values(analysis.endpoints).filter((result) =>
    Number.isFinite(result.logrankP),
  ).length;
}

export function qValueExplanation(analysis: SurvivalAnalysis): string {
  const count = testedOutcomeCount(analysis);
  if (!count) return "No outcome has an estimable log-rank p-value.";
  if (count === 1)
    return "One tested outcome: q equals p, so the figure shows p only.";
  return `Optional; off by default. q adjusts the ${count} tested outcomes in this analysis using Benjamini–Hochberg. It does not adjust for other genes or comparisons you try.`;
}
