import { ENDPOINTS } from "./types";
import type { Endpoint } from "./types";

export type FontFamily = "Sans" | "Serif" | "Mono";
export type Dash = "solid" | "dashed" | "dotted";
export interface PanelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ElementStyle {
  dx?: number;
  dy?: number;
  text?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  hidden?: boolean;
  lineWidth?: number;
  dash?: Dash;
}
export interface Axes {
  xMin: number;
  xMax: number | null;
  xStep: number | null;
  yMin: number;
  yMax: number;
  yStep: number;
}
export interface Annotation {
  id: string;
  kind: "text" | "line" | "arrow";
  text: string;
  x: number;
  y: number;
  x2: number;
  y2: number;
  color: string;
  fontSize: number;
  lineWidth: number;
}
export interface FigureSettings {
  widthIn: number;
  heightIn: number;
  fontFamily: FontFamily;
  fontScale: number;
  lowColor: string;
  highColor: string;
  lineWidth: number;
  lowDash: Dash;
  highDash: Dash;
  lowLabel: string;
  highLabel: string;
  unit: "months" | "years" | "days";
  endpoints: Endpoint[];
  panels: Record<Endpoint, PanelBox>;
  axes: Record<Endpoint, Axes>;
  elements: Record<string, ElementStyle>;
  annotations: Annotation[];
  confidence: boolean;
  confidenceLevel: 0.9 | 0.95 | 0.99;
  censors: boolean;
  riskTable: boolean;
  showLegend: boolean;
  showP: boolean;
  showQ: boolean;
  showHr: boolean;
  dpi: 150 | 300 | 600;
}

export const DEFAULT_AXES: Axes = {
  xMin: 0,
  xMax: null,
  xStep: null,
  yMin: 0,
  yMax: 1,
  yStep: 0.2,
};
const LEGACY_PANELS = [
  { x: 60, y: 80, width: 160, height: 155 },
  { x: 300, y: 80, width: 160, height: 155 },
  { x: 60, y: 302, width: 160, height: 155 },
  { x: 300, y: 302, width: 160, height: 155 },
];
export function defaultFigure(): FigureSettings {
  return {
    widthIn: 6.8,
    heightIn: 6.8,
    fontFamily: "Sans",
    fontScale: 1,
    lowColor: "#2f6fb0",
    highColor: "#c43c39",
    lineWidth: 2.1,
    lowDash: "solid",
    highDash: "solid",
    lowLabel: "Low",
    highLabel: "High",
    unit: "months",
    endpoints: [...ENDPOINTS],
    panels: Object.fromEntries(
      ENDPOINTS.map((ep, i) => [
        ep,
        Object.fromEntries(
          Object.entries(LEGACY_PANELS[i]).map(([key, value]) => [
            key,
            value / 489.6,
          ]),
        ),
      ]),
    ) as unknown as Record<Endpoint, PanelBox>,
    axes: Object.fromEntries(
      ENDPOINTS.map((ep) => [ep, { ...DEFAULT_AXES }]),
    ) as Record<Endpoint, Axes>,
    elements: {},
    annotations: [],
    confidence: false,
    confidenceLevel: 0.95,
    censors: false,
    riskTable: false,
    showLegend: true,
    showP: true,
    showQ: true,
    showHr: true,
    dpi: 300,
  };
}

export function layoutFigure(
  settings: FigureSettings,
  layout: "grid" | "row" | "column",
): FigureSettings {
  const result = structuredClone(settings),
    count = settings.endpoints.length;
  if (!count) return result;
  const columns =
    layout === "row" ? count : layout === "column" ? 1 : Math.min(2, count);
  const rows = Math.ceil(count / columns);
  const w = settings.widthIn * 72,
    h = settings.heightIn * 72;
  for (const [i, ep] of settings.endpoints.entries()) {
    const header = Math.min(46, h * 0.2);
    const cellW = w / columns,
      cellH = (h - header) / rows;
    const left = Math.min(60, Math.max(0, (cellW - 30) * 0.7));
    const right = Math.min(25, Math.max(0, cellW - left - 30));
    const top = Math.min(34, Math.max(0, (cellH - 30) / 2));
    const bottom = Math.min(33, Math.max(0, cellH - top - 30));
    result.panels[ep] = {
      x: (cellW * (i % columns) + left) / w,
      y: (header + cellH * Math.floor(i / columns) + top) / h,
      width: (cellW - left - right) / w,
      height: (cellH - top - bottom) / h,
    };
  }
  return result;
}

export function reusableStyle(settings: FigureSettings): FigureSettings {
  const result = structuredClone(settings);
  result.annotations = [];
  result.lowLabel = "Low";
  result.highLabel = "High";
  for (const style of Object.values(result.elements)) delete style.text;
  return result;
}

export function dashArray(dash: Dash): string | undefined {
  return dash === "dashed" ? "6 3" : dash === "dotted" ? "1.5 2.5" : undefined;
}

export function displayTime(
  months: number,
  unit: FigureSettings["unit"],
): number {
  return unit === "years"
    ? months / 12
    : unit === "days"
      ? months * 30.4375
      : months;
}
export function timeInMonths(
  value: number,
  unit: FigureSettings["unit"],
): number {
  return unit === "years"
    ? value * 12
    : unit === "days"
      ? value / 30.4375
      : value;
}
export function elementName(id: string | null): string {
  if (!id) return "Figure";
  return id
    .split(".")
    .map(
      (part) =>
        ({
          title: "Title",
          source: "Data source",
          grouping: "Comparison",
          xlabel: "Time label",
          ylabel: "Survival label",
          legend: "Legend",
          statistics: "Statistics",
          curve: "Curve",
          low: "Low",
          high: "High",
          panel: "Panel",
          annotation: "Annotation",
        })[part] ?? part,
    )
    .join(" · ");
}
