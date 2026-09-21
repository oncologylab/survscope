import { defaultFigure, reusableStyle } from "./figure";
import type { Annotation, ElementStyle, FigureSettings } from "./figure";
import { resolveProvenance, attachProvenance } from "./citations";
import type { AnalysisProvenance } from "./citations";
import { SOFTWARE_VERSION } from "./version";
export { SOFTWARE_VERSION } from "./version";
import { normalizeGrouping } from "./grouping";
import { ENDPOINTS } from "./types";
import type {
  Curve,
  Endpoint,
  EndpointResult,
  RiskPoint,
  SurvivalAnalysis,
} from "./types";

export interface FigureProject {
  format: "survscope-project";
  version: 2;
  softwareVersion: string;
  analysis: SurvivalAnalysis;
  settings: FigureSettings;
}
export interface FigurePreset {
  format: "survscope-preset";
  version: 2;
  settings: FigureSettings;
}
const failure = (message: string): never => {
  throw new Error(`Unable to open this file: ${message}`);
};
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    failure("an object was expected.");
  const record = value as Record<string, any>;
  if (
    Object.keys(record).some((key) =>
      ["__proto__", "prototype", "constructor"].includes(key),
    )
  )
    failure("unsupported property.");
  return record;
}
function number(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    failure("a number is outside its supported range.");
  return value as number;
}
function count(value: unknown): number {
  const n = number(value, 0, 1000000);
  if (!Number.isInteger(n))
    failure("patient and event counts must be whole numbers.");
  return n;
}
function text(value: unknown, max = 1000): string {
  if (typeof value !== "string" || value.length > max)
    failure("a text field is invalid or too long.");
  return value as string;
}
function choice<T extends string | number>(
  value: unknown,
  choices: readonly T[],
): T {
  if (!choices.includes(value as T)) failure("an option is unsupported.");
  return value as T;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") failure("a checkbox value is invalid.");
  return value as boolean;
}
function color(value: unknown): string {
  const s = text(value, 7);
  if (!/^#[0-9a-f]{6}$/i.test(s))
    failure("colors must use six-digit hexadecimal notation.");
  return s;
}
function array(value: unknown, max = 100000): any[] {
  if (!Array.isArray(value) || value.length > max)
    failure("an array is invalid or too large.");
  return value as any[];
}
function optionalNumber(value: unknown, min = -1e100, max = 1e100): number {
  return value === null ? NaN : number(value, min, max);
}

export function validateSettings(value: unknown): FigureSettings {
  const raw = object(value),
    result = defaultFigure();
  if (Object.keys(raw).some((key) => !(key in result)))
    failure("these figure settings need a newer application.");
  result.widthIn = number(raw.widthIn, 2, 20);
  result.heightIn = number(raw.heightIn, 2, 20);
  result.fontFamily = choice(raw.fontFamily, ["Sans", "Serif", "Mono"]);
  result.fontScale = number(raw.fontScale, 0.5, 3);
  result.lineWidth = number(raw.lineWidth, 0.2, 12);
  result.lowColor = color(raw.lowColor);
  result.highColor = color(raw.highColor);
  result.lowDash = choice(raw.lowDash, ["solid", "dashed", "dotted"]);
  result.highDash = choice(raw.highDash, ["solid", "dashed", "dotted"]);
  result.lowLabel = text(raw.lowLabel, 40);
  result.highLabel = text(raw.highLabel, 40);
  result.unit = choice(raw.unit, ["months", "years", "days"]);
  result.dpi = choice(raw.dpi, [150, 300, 600]);
  result.confidenceLevel = choice(raw.confidenceLevel, [0.9, 0.95, 0.99]);
  for (const key of [
    "confidence",
    "censors",
    "riskTable",
    "showLegend",
    "showP",
    "showQ",
    "showHr",
  ] as const)
    result[key] = boolean(raw[key]);
  result.endpoints = array(raw.endpoints, 4).map((ep) => choice(ep, ENDPOINTS));
  if (
    !result.endpoints.length ||
    new Set(result.endpoints).size !== result.endpoints.length
  )
    failure("select at least one distinct outcome.");
  const panels = object(raw.panels),
    axes = object(raw.axes);
  for (const ep of ENDPOINTS) {
    const box = object(panels[ep]),
      axis = object(axes[ep]);
    result.panels[ep] = {
      x: number(box.x, 0, 1),
      y: number(box.y, 0, 1),
      width: number(box.width, 0.005, 1),
      height: number(box.height, 0.005, 1),
    };
    if (box.x + box.width > 1.000001 || box.y + box.height > 1.000001)
      failure("a panel extends beyond the canvas.");
    result.axes[ep] = {
      xMin: number(axis.xMin, 0, 1e9),
      xMax: axis.xMax === null ? null : number(axis.xMax, 0, 1e9),
      xStep: axis.xStep === null ? null : number(axis.xStep, 1e-10, 1e9),
      yMin: number(axis.yMin, 0, 1),
      yMax: number(axis.yMax, 0, 1),
      yStep: number(axis.yStep, 0.01, 1),
    };
    if (
      axis.yMax <= axis.yMin ||
      (axis.xMax !== null && axis.xMax <= axis.xMin)
    )
      failure("axis maximum must exceed its minimum.");
  }
  const elements = object(raw.elements);
  const allowedIds = new Set([
    "title",
    "source",
    "grouping",
    "label.low",
    "label.high",
    ...array(raw.annotations, 100).map(
      (a) => `annotation.${text(object(a).id, 100)}`,
    ),
    ...ENDPOINTS.flatMap((ep) => [
      `panel.${ep}`,
      `title.${ep}`,
      `xlabel.${ep}`,
      `ylabel.${ep}`,
      `legend.${ep}`,
      `statistics.${ep}`,
      `curve.low.${ep}`,
      `curve.high.${ep}`,
    ]),
  ]);
  for (const [id, value] of Object.entries(elements)) {
    if (!allowedIds.has(id)) failure("an editable item is unknown.");
    const s = object(value),
      style: ElementStyle = {};
    const keys = [
      "runs",
      "fontFamily",
      "align",
      "rotation",
      "locked",
      "dx",
      "dy",
      "text",
      "fontSize",
      "color",
      "bold",
      "italic",
      "hidden",
      "lineWidth",
      "dash",
    ];
    if (Object.keys(s).some((key) => !keys.includes(key)))
      failure("an item style is unsupported.");
    if (s.fontFamily !== undefined)
      style.fontFamily = choice(s.fontFamily, [
        "Sans",
        "Serif",
        "Mono",
      ] as const);
    if (s.align !== undefined)
      style.align = choice(s.align, ["start", "middle", "end"] as const);
    if (s.rotation !== undefined)
      style.rotation = number(s.rotation, -360, 360);
    if (s.runs !== undefined) {
      if (
        !/^(title|source|grouping|xlabel|ylabel|label|annotation)(\.|$)/.test(
          id,
        )
      )
        failure("computed values cannot be replaced with text.");
      style.runs = array(s.runs, 1000).map((value) => {
        const run = object(value);
        if (
          Object.keys(run).some(
            (k) => !["text", "bold", "italic", "script"].includes(k),
          )
        )
          failure("unsupported text formatting.");
        return {
          text: text(run.text, 500),
          ...(run.bold === undefined ? {} : { bold: boolean(run.bold) }),
          ...(run.italic === undefined ? {} : { italic: boolean(run.italic) }),
          ...(run.script === undefined
            ? {}
            : { script: choice(run.script, ["super", "sub"] as const) }),
        };
      });
      text(
        style.runs.map((r) => r.text).join(""),
        id.startsWith("label.") ? 40 : 500,
      );
    }
    if (s.dx !== undefined) style.dx = number(s.dx, -10000, 10000);
    if (s.dy !== undefined) style.dy = number(s.dy, -10000, 10000);
    if (s.text !== undefined) {
      if (!/^(title|source|grouping|xlabel|ylabel|label)(\.|$)/.test(id))
        failure("computed values cannot be replaced with text.");
      style.text = text(s.text, 500);
    }
    if (s.fontSize !== undefined) style.fontSize = number(s.fontSize, 4, 72);
    if (s.lineWidth !== undefined)
      style.lineWidth = number(s.lineWidth, 0.2, 12);
    if (s.color !== undefined) style.color = color(s.color);
    for (const key of ["bold", "italic", "hidden", "locked"] as const)
      if (s[key] !== undefined) style[key] = boolean(s[key]);
    if (s.dash !== undefined)
      style.dash = choice(s.dash, ["solid", "dashed", "dotted"] as const);
    if (id.startsWith("curve.") && (style.dx || style.dy || style.rotation))
      failure("survival curves cannot be moved independently of their axes.");
    result.elements[id] = style;
  }
  const ids = new Set<string>();
  result.annotations = array(raw.annotations, 100).map((value) => {
    const a = object(value),
      id = text(a.id, 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id))
      failure("annotation identifiers must be unique.");
    ids.add(id);
    return {
      id,
      kind: choice(a.kind, ["text", "line", "arrow"]),
      text: text(a.text, 500),
      x: number(a.x, -10, 10),
      y: number(a.y, -10, 10),
      x2: number(a.x2, -10, 10),
      y2: number(a.y2, -10, 10),
      fontSize: number(a.fontSize, 4, 72),
      lineWidth: number(a.lineWidth, 0.2, 12),
      color: color(a.color),
    } as Annotation;
  });
  return result;
}

function validateCurve(value: unknown): Curve {
  const c = object(value);
  const result: Curve = {
    n: count(c.n),
    events: count(c.events),
    xMonths: array(c.xMonths).map((x) => number(x, 0, 1000000)),
    survival: array(c.survival).map((x) => number(x, 0, 1)),
    timeline: [],
  };
  if (
    result.xMonths.length !== result.survival.length ||
    result.events > result.n
  )
    failure("curve dimensions or counts are inconsistent.");
  for (let i = 1; i < result.xMonths.length; i++) {
    if (
      result.xMonths[i] < result.xMonths[i - 1] ||
      result.survival[i] > result.survival[i - 1] + 1e-12
    )
      failure("curve coordinates are out of order.");
  }
  let remaining = result.n,
    totalEvents = 0,
    lastTime = -1;
  result.timeline = array(c.timeline).map((value) => {
    const p = object(value);
    const point: RiskPoint = {
      timeMonths: number(p.timeMonths, 0, 1000000),
      survival: number(p.survival, 0, 1),
      atRisk: count(p.atRisk),
      events: count(p.events),
      censored: count(p.censored),
      greenwood: p.greenwood === null ? null : number(p.greenwood, 0, 1000000),
    };
    if (
      point.timeMonths <= lastTime ||
      point.atRisk !== remaining ||
      point.events + point.censored > remaining
    )
      failure("risk-table counts are inconsistent.");
    remaining -= point.events + point.censored;
    totalEvents += point.events;
    lastTime = point.timeMonths;
    return point;
  });
  if (remaining || totalEvents !== result.events)
    failure("curve totals do not match its risk table.");
  return result;
}
function validateAnalysis(value: unknown): SurvivalAnalysis {
  const a = object(value),
    endpoints = object(a.endpoints);
  if (a.statisticsVersion !== "1")
    failure("this statistical version is unsupported.");
  const result: SurvivalAnalysis = {
    gene: text(a.gene, 100),
    ensembl: text(a.ensembl, 100),
    cohort: text(a.cohort, 100),
    cohortLabel: text(a.cohortLabel),
    sourceExpression: text(a.sourceExpression),
    sourceSurvival: text(a.sourceSurvival),
    dataVersion: text(a.dataVersion, 10),
    statisticsVersion: "1",
    grouping: normalizeGrouping(object(a.grouping) as any),
    groupingLabel: text(a.groupingLabel),
    cutoff:
      a.cutoff === "median"
        ? "median"
        : a.cutoff === null
          ? null
          : number(a.cutoff, 0, 1e100),
    endpoints: {} as Record<Endpoint, EndpointResult>,
  };
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(result.dataVersion))
    failure("the data version is invalid.");
  for (const ep of ENDPOINTS) {
    const e = object(endpoints[ep]);
    if (e.endpoint !== ep) failure("outcome identifiers do not match.");
    const entry: EndpointResult = {
      endpoint: ep,
      quality: choice(e.quality, [
        "recommended",
        "caution",
        "not_recommended",
        "unavailable",
      ]),
      qualityNote: text(e.qualityNote),
      warning: text(e.warning),
      n: count(e.n),
      nLow: count(e.nLow),
      nHigh: count(e.nHigh),
      events: count(e.events),
      eventsLow: count(e.eventsLow),
      eventsHigh: count(e.eventsHigh),
      eligibleN: count(e.eligibleN),
      excludedMiddle: count(e.excludedMiddle),
      cutoffTpm: optionalNumber(e.cutoffTpm, 0),
      lowerThreshold: optionalNumber(e.lowerThreshold, 0),
      upperThreshold: optionalNumber(e.upperThreshold, 0),
      logrankChi2: optionalNumber(e.logrankChi2, 0),
      logrankP: optionalNumber(e.logrankP, 0, 1),
      logrankQ: optionalNumber(e.logrankQ, 0, 1),
      coxHr: optionalNumber(e.coxHr, 0),
      coxP: optionalNumber(e.coxP, 0, 1),
      coxStatus: choice(e.coxStatus, [
        "ok",
        "empty_group",
        "no_events",
        "no_information",
        "separation",
        "not_converged",
      ]),
      low: validateCurve(e.low),
      high: validateCurve(e.high),
    };
    if (
      entry.n !== entry.nLow + entry.nHigh ||
      entry.events !== entry.eventsLow + entry.eventsHigh ||
      entry.eligibleN !== entry.n + entry.excludedMiddle ||
      entry.low.n !== entry.nLow ||
      entry.high.n !== entry.nHigh ||
      entry.low.events !== entry.eventsLow ||
      entry.high.events !== entry.eventsHigh
    )
      failure("analysis counts are inconsistent.");
    result.endpoints[ep] = entry;
  }
  if (a.provenance !== undefined)
    result.provenance = validateProvenance(a.provenance, result);
  return result;
}

function validateProvenance(
  value: unknown,
  analysis: SurvivalAnalysis,
): AnalysisProvenance {
  const p = object(value);
  if (
    p.version !== 1 ||
    p.dataVersion !== analysis.dataVersion ||
    p.cohort !== analysis.cohort
  )
    failure("citation provenance does not match this analysis.");
  const url = (value: unknown) => {
    const s = text(value, 2000);
    if (!/^https:\/\/[^\s]+$/.test(s)) failure("a citation URL is invalid.");
    return s;
  };
  const program = choice(p.program, ["TCGA", "CPTAC"] as const);
  if (program !== (analysis.cohort.startsWith("CPTAC-") ? "CPTAC" : "TCGA"))
    failure("citation program does not match this analysis.");
  return {
    version: 1,
    program,
    project: text(p.project, 100),
    cohort: analysis.cohort,
    dataVersion: analysis.dataVersion,
    softwareVersion: text(p.softwareVersion, 40),
    upstreamRelease:
      p.upstreamRelease === null ? null : text(p.upstreamRelease),
    assetDataVersion:
      p.assetDataVersion === null ? null : text(p.assetDataVersion, 10),
    expressionSource: text(p.expressionSource),
    survivalSource: text(p.survivalSource),
    acknowledgement: text(p.acknowledgement, 2000),
    cohortPublicationNote: text(p.cohortPublicationNote, 2000),
    citations: array(p.citations, 64).map((value) => {
      const c = object(value);
      const result = {
        id: text(c.id, 100),
        role: text(c.role, 200),
        authors: array(c.authors, 500).map((a) => text(a, 200)),
        title: text(c.title, 2000),
        url: url(c.url),
      } as AnalysisProvenance["citations"][number];
      if (c.year !== undefined) result.year = number(c.year, 1800, 2200);
      for (const key of ["journal", "volume", "issue", "pages", "doi"] as const)
        if (c[key] !== undefined) result[key] = text(c[key], 500);
      if (result.doi && !/^10\.\d{4,9}\/[^\s]+$/.test(result.doi))
        failure("a citation DOI is invalid.");
      return result;
    }),
  };
}

export function projectFile(
  analysis: SurvivalAnalysis,
  settings: FigureSettings,
): FigureProject {
  return {
    format: "survscope-project",
    version: 2,
    softwareVersion: SOFTWARE_VERSION,
    analysis: analysis.provenance ? analysis : attachProvenance(analysis),
    settings,
  };
}
export function presetFile(settings: FigureSettings): FigurePreset {
  return {
    format: "survscope-preset",
    version: 2,
    settings: reusableStyle(settings),
  };
}
export function readFigureFile(contents: string): FigureProject | FigurePreset {
  if (contents.length > 10 * 1024 * 1024)
    failure("the maximum project size is 10 MiB.");
  let raw: Record<string, any>;
  try {
    raw = object(JSON.parse(contents));
  } catch {
    return failure("choose a valid SurvScope project or preset JSON file.");
  }
  if (raw.version !== 1 && raw.version !== 2)
    failure("this file version is unsupported.");
  const settings = validateSettings(raw.settings);
  if (raw.format === "survscope-preset")
    return {
      format: raw.format,
      version: 2,
      settings: reusableStyle(settings),
    };
  if (raw.format !== "survscope-project")
    failure(
      "choose a project file, rather than the analysis-only JSON export.",
    );
  const analysis = validateAnalysis(raw.analysis);
  if (!analysis.provenance) {
    analysis.provenance = resolveProvenance(analysis);
    analysis.provenance.softwareVersion = text(raw.softwareVersion, 40);
    const software = analysis.provenance.citations.find(
      (c) => c.id === "survscope",
    );
    if (software)
      software.title = `SurvScope ${analysis.provenance.softwareVersion}`;
  }
  return {
    format: "survscope-project",
    version: 2,
    softwareVersion: text(raw.softwareVersion, 40),
    analysis,
    settings,
  };
}
