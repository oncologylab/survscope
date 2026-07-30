import { forwardRef } from "react";

import { ENDPOINTS } from "./types";
import { formatP } from "./statistics";
import type { Curve, EndpointResult, SurvivalAnalysis } from "./types";

const WIDTH = 489.6;
const HEIGHT = 489.6;
const BLUE = "#2f6fb0";
const RED = "#c43c39";

interface PanelGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

const PANELS: PanelGeometry[] = [
  { left: 60, top: 80, width: 160, height: 155 },
  { left: 300, top: 80, width: 160, height: 155 },
  { left: 60, top: 302, width: 160, height: 155 },
  { left: 300, top: 302, width: 160, height: 155 },
];

function niceMaximum(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function curvePath(
  curve: Curve,
  geometry: PanelGeometry,
  maxMonths: number,
): string {
  return curve.xMonths
    .map((x, index) => {
      const px = geometry.left + (x / maxMonths) * geometry.width;
      const py =
        geometry.top + geometry.height - curve.survival[index] * geometry.height;
      return `${index === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`;
    })
    .join(" ");
}

function Panel({
  gene,
  result,
  geometry,
}: {
  gene: string;
  result: EndpointResult;
  geometry: PanelGeometry;
}) {
  const curveMaximum = Math.max(
    1,
    ...result.low.xMonths,
    ...result.high.xMonths,
  );
  const maxMonths = niceMaximum(curveMaximum);
  const xTicks = Array.from({ length: 5 }, (_, index) => (maxMonths * index) / 4);
  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const axisBottom = geometry.top + geometry.height;
  const axisRight = geometry.left + geometry.width;
  const annotation = Number.isFinite(result.coxHr)
    ? `HR=${result.coxHr.toFixed(2)}`
    : "HR=NA";
  return (
    <g>
      <text
        x={geometry.left + geometry.width / 2}
        y={geometry.top - 11}
        textAnchor="middle"
        fontSize="9"
      >
        {gene} {result.endpoint}
      </text>
      <line
        x1={geometry.left}
        y1={geometry.top}
        x2={geometry.left}
        y2={axisBottom}
        stroke="#111"
        strokeWidth="0.9"
      />
      <line
        x1={geometry.left}
        y1={axisBottom}
        x2={axisRight}
        y2={axisBottom}
        stroke="#111"
        strokeWidth="0.9"
      />
      {yTicks.map((tick) => {
        const y = axisBottom - tick * geometry.height;
        return (
          <g key={tick}>
            <line
              x1={geometry.left - 4}
              y1={y}
              x2={geometry.left}
              y2={y}
              stroke="#111"
              strokeWidth="0.9"
            />
            <text
              x={geometry.left - 8}
              y={y + 3}
              textAnchor="end"
              fontSize="8.5"
            >
              {tick.toFixed(1)}
            </text>
          </g>
        );
      })}
      {xTicks.map((tick) => {
        const x = geometry.left + (tick / maxMonths) * geometry.width;
        return (
          <g key={tick}>
            <line
              x1={x}
              y1={axisBottom}
              x2={x}
              y2={axisBottom + 4}
              stroke="#111"
              strokeWidth="0.9"
            />
            <text
              x={x}
              y={axisBottom + 15}
              textAnchor="middle"
              fontSize="8.5"
            >
              {Math.round(tick)}
            </text>
          </g>
        );
      })}
      <text
        x={geometry.left + geometry.width / 2}
        y={axisBottom + 29}
        textAnchor="middle"
        fontSize="9"
      >
        Months
      </text>
      <text
        x={geometry.left - 28}
        y={geometry.top + geometry.height / 2}
        textAnchor="middle"
        fontSize="9"
        transform={`rotate(-90 ${geometry.left - 28} ${
          geometry.top + geometry.height / 2
        })`}
      >
        Survival
      </text>
      {result.low.xMonths.length > 1 && (
        <path
          d={curvePath(result.low, geometry, maxMonths)}
          fill="none"
          stroke={BLUE}
          strokeWidth="2.1"
          strokeLinejoin="miter"
        />
      )}
      {result.high.xMonths.length > 1 && (
        <path
          d={curvePath(result.high, geometry, maxMonths)}
          fill="none"
          stroke={RED}
          strokeWidth="2.1"
          strokeLinejoin="miter"
        />
      )}
      <g transform={`translate(${axisRight - 91},${geometry.top + 8})`}>
        <line x1="0" y1="0" x2="18" y2="0" stroke={BLUE} strokeWidth="2.1" />
        <text x="23" y="3" fontSize="8">
          Low n={result.nLow}, e={result.eventsLow}
        </text>
        <line x1="0" y1="13" x2="18" y2="13" stroke={RED} strokeWidth="2.1" />
        <text x="23" y="16" fontSize="8">
          High n={result.nHigh}, e={result.eventsHigh}
        </text>
      </g>
      <text
        x={axisRight - 5}
        y={axisBottom - 20}
        textAnchor="end"
        fontSize="8.5"
      >
        p={formatP(result.logrankP)} q={formatP(result.logrankQ)}
      </text>
      <text
        x={axisRight - 5}
        y={axisBottom - 8}
        textAnchor="end"
        fontSize="8.5"
      >
        {annotation}
      </text>
    </g>
  );
}

export const SurvivalPlot = forwardRef<
  SVGSVGElement,
  { analysis: SurvivalAnalysis }
>(function SurvivalPlot({ analysis }, ref) {
  return (
    <svg
      ref={ref}
      className="survival-plot"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="6.8in"
      height="6.8in"
      role="img"
      aria-labelledby="plot-title plot-description"
      style={{
        background: "#ffffff",
        color: "#111111",
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        fontWeight: 700,
      }}
    >
      <title id="plot-title">
        {analysis.gene} TCGA-{analysis.cohort} survival
      </title>
      <desc id="plot-description">
        Four Kaplan-Meier panels for overall, disease-specific,
        progression-free, and disease-free survival.
      </desc>
      <rect width={WIDTH} height={HEIGHT} fill="#fff" />
      <text x={WIDTH / 2} y="14" textAnchor="middle" fontSize="12">
        {analysis.gene} TCGA-{analysis.cohort} survival
      </text>
      <text x={WIDTH / 2} y="33" textAnchor="middle" fontSize="9">
        Expression: GDC STAR TPM; endpoints: PanCanAtlas TCGA-CDR
      </text>
      {ENDPOINTS.map((endpoint, index) => (
        <Panel
          key={endpoint}
          gene={analysis.gene}
          result={analysis.endpoints[endpoint]}
          geometry={PANELS[index]}
        />
      ))}
    </svg>
  );
});
