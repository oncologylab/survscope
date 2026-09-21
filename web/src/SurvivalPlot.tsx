import { forwardRef, memo, useImperativeHandle, useRef } from "react";
import type { ReactNode } from "react";
import { RichSvgText } from "./RichSvgText";
import { objectStyle } from "./editorModel";
import { legendEntry, testedOutcomeCount } from "./plotLabels";
import { usePlotInteraction } from "./PlotInteraction";
import type { PlotEditor } from "./PlotInteraction";
import { cohortDisplayName } from "./cohorts";
import { atRisk, confidenceBounds, formatP } from "./statistics";
import { dashArray, defaultFigure, displayTime, timeInMonths } from "./figure";
import type { FigureSettings } from "./figure";
import type { Curve, EndpointResult, SurvivalAnalysis } from "./types";

interface Geometry {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Props {
  analysis: SurvivalAnalysis;
  settings?: FigureSettings;
  editor?: PlotEditor;
}

export function niceMaximum(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value)),
    normalized = value / magnitude;
  return (
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude
  );
}
function ticks(min: number, max: number, step: number): number[] {
  if (!(step > 0) || !(max > min)) return [];
  // Keep the complete visible range when a requested spacing would create too many labels.
  step *= Math.max(1, Math.ceil((max - min) / step / 100));
  const count = Math.floor((max - min) / step + 1e-9) + 1;
  return Array.from({ length: count }, (_, i) => min + i * step);
}
function tickLabel(value: number, step: number, y = false): string {
  const digits = Math.min(
    6,
    Math.max(y ? 1 : 0, String(step).split(".")[1]?.length ?? 0),
  );
  return value.toFixed(digits);
}

const PlotArtwork = memo(function PlotArtwork({
  analysis,
  settings,
}: {
  analysis: SurvivalAnalysis;
  settings: FigureSettings;
}) {
  const width = settings.widthIn * 72,
    height = settings.heightIn * 72;
  const showQ = settings.showQ && testedOutcomeCount(analysis) > 1;
  function element(id: string, children: ReactNode) {
    const style = settings.elements[id] ?? {};
    if (style.hidden) return null;
    return (
      <g
        key={id}
        data-element={id}
        transform={`translate(${style.dx ?? 0},${style.dy ?? 0})`}
        pointerEvents="bounding-box"
        style={{
          cursor: style.locked
            ? "default"
            : id.startsWith("curve.")
              ? "pointer"
              : "move",
        }}
      >
        {children}
      </g>
    );
  }
  function text(
    id: string,
    value: string,
    x: number,
    y: number,
    size: number,
    anchor: "start" | "middle" | "end" = "middle",
    rotate = false,
  ) {
    return element(
      id,
      <RichSvgText
        id={id}
        value={value}
        x={x}
        y={y}
        size={size * settings.fontScale}
        style={settings.elements[id]}
        anchor={anchor}
        rotation={rotate ? -90 : 0}
      />,
    );
  }
  function panel(result: EndpointResult): ReactNode {
    const ep = result.endpoint;
    if (settings.elements[`panel.${ep}`]?.hidden) return null;
    const box = settings.panels[ep];
    const geometry: Geometry = {
      left: box.x * width,
      top: box.y * height,
      width: box.width * width,
      height: box.height * height,
    };
    if (result.quality === "unavailable")
      return (
        <g key={ep} data-element={`panel.${ep}`}>
          {text(
            `title.${ep}`,
            `${analysis.gene} ${ep}`,
            geometry.left + geometry.width / 2,
            geometry.top - 11,
            9,
          )}
          <text
            x={geometry.left + geometry.width / 2}
            y={geometry.top + geometry.height / 2}
            textAnchor="middle"
            fontSize={9 * settings.fontScale}
          >
            Endpoint unavailable
          </text>
        </g>
      );
    const g = {
      ...geometry,
      height: Math.max(20, geometry.height - (settings.riskTable ? 44 : 0)),
    };
    const axes = settings.axes[ep];
    const autoMaximum = niceMaximum(
      Math.max(
        1,
        ...result.low.xMonths.map((x) => displayTime(x, settings.unit)),
        ...result.high.xMonths.map((x) => displayTime(x, settings.unit)),
      ),
    );
    const max = axes.xMax ?? Math.max(autoMaximum, axes.xMin + 1);
    const xStep = axes.xStep ?? (max - axes.xMin) / 4;
    const xTicks = ticks(axes.xMin, max, xStep),
      yTicks = ticks(axes.yMin, axes.yMax, axes.yStep);
    const bottom = g.top + g.height,
      right = g.left + g.width;
    const px = (months: number) =>
      g.left +
      ((displayTime(months, settings.unit) - axes.xMin) / (max - axes.xMin)) *
        g.width;
    const py = (survival: number) =>
      bottom - ((survival - axes.yMin) / (axes.yMax - axes.yMin)) * g.height;
    const curvePath = (curve: Curve) =>
      curve.xMonths
        .map(
          (x, i) =>
            `${i ? "L" : "M"}${px(x).toFixed(2)},${py(curve.survival[i]).toFixed(2)}`,
        )
        .join(" ");
    const color = (group: "low" | "high") =>
      settings.elements[`curve.${group}.${ep}`]?.color ??
      (group === "low" ? settings.lowColor : settings.highColor);
    const lineWidth = (group: "low" | "high") =>
      settings.elements[`curve.${group}.${ep}`]?.lineWidth ??
      settings.lineWidth;
    const dash = (group: "low" | "high") =>
      dashArray(
        settings.elements[`curve.${group}.${ep}`]?.dash ??
          (group === "low" ? settings.lowDash : settings.highDash),
      );
    function confidencePath(curve: Curve): string {
      if (!curve.n) return "";
      const lower: [number, number][] = [[0, 1]],
        upper: [number, number][] = [[0, 1]];
      let previous: [number, number] = [1, 1];
      for (const point of curve.timeline) {
        lower.push([point.timeMonths, previous[0]]);
        upper.push([point.timeMonths, previous[1]]);
        const bounds = confidenceBounds(
          point.survival,
          point.greenwood,
          settings.confidenceLevel,
        );
        if (!bounds.every(Number.isFinite)) break;
        lower.push([point.timeMonths, bounds[0]]);
        upper.push([point.timeMonths, bounds[1]]);
        previous = bounds;
      }
      return (
        [...upper, ...lower.reverse()]
          .map(([x, y], i) => `${i ? "L" : "M"}${px(x)},${py(y)}`)
          .join(" ") + "Z"
      );
    }
    const legendStyle = settings.elements[`legend.${ep}`] ?? {};
    const statStyle = settings.elements[`statistics.${ep}`] ?? {};
    const statText = [
      settings.showP ? `p=${formatP(result.logrankP)}` : "",
      showQ ? `q=${formatP(result.logrankQ)}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <g key={ep} data-element={`panel.${ep}`}>
        {
          <rect
            x={g.left}
            y={g.top}
            width={g.width}
            height={geometry.height}
            fill="transparent"
            data-editor-only="true"
          />
        }
        {text(
          `title.${ep}`,
          `${analysis.gene} ${ep}`,
          g.left + g.width / 2,
          g.top - 11,
          9,
        )}
        <defs>
          <clipPath id={`clip-${ep}`}>
            <rect
              x={g.left}
              y={g.top}
              width={g.width + 2.2}
              height={g.height + 2.2}
              transform="translate(-1.1,-1.1)"
            />
          </clipPath>
        </defs>
        <line
          x1={g.left}
          y1={g.top}
          x2={g.left}
          y2={bottom}
          stroke="#111"
          strokeWidth="0.9"
        />
        <line
          x1={g.left}
          y1={bottom}
          x2={right}
          y2={bottom}
          stroke="#111"
          strokeWidth="0.9"
        />
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={g.left - 4}
              y1={py(tick)}
              x2={g.left}
              y2={py(tick)}
              stroke="#111"
              strokeWidth="0.9"
            />
            <text
              x={g.left - 8}
              y={py(tick) + 3}
              textAnchor="end"
              fontSize={8.5 * settings.fontScale}
            >
              {tickLabel(tick, axes.yStep, true)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => {
          const x = px(timeInMonths(tick, settings.unit));
          return (
            <g key={tick}>
              <line
                x1={x}
                y1={bottom}
                x2={x}
                y2={bottom + 4}
                stroke="#111"
                strokeWidth="0.9"
              />
              <text
                x={x}
                y={bottom + 15}
                textAnchor="middle"
                fontSize={8.5 * settings.fontScale}
              >
                {tickLabel(tick, xStep)}
              </text>
            </g>
          );
        })}
        {text(
          `xlabel.${ep}`,
          settings.unit[0].toUpperCase() + settings.unit.slice(1),
          g.left + g.width / 2,
          bottom + 29,
          9,
        )}
        {text(
          `ylabel.${ep}`,
          "Survival",
          g.left - 28,
          g.top + g.height / 2,
          9,
          "middle",
          true,
        )}
        <g clipPath={`url(#clip-${ep})`}>
          {(["low", "high"] as const).map((group) =>
            settings.elements[`curve.${group}.${ep}`]?.hidden ? null : (
              <g key={group}>
                {settings.confidence && (
                  <path
                    data-confidence={group}
                    d={confidencePath(result[group])}
                    fill={color(group)}
                    opacity="0.16"
                    stroke="none"
                  />
                )}
                {result[group].xMonths.length > 1 &&
                  element(
                    `curve.${group}.${ep}`,
                    <path
                      d={curvePath(result[group])}
                      fill="none"
                      stroke={color(group)}
                      strokeWidth={lineWidth(group)}
                      strokeDasharray={dash(group)}
                      strokeLinejoin="miter"
                    />,
                  )}
                {settings.censors &&
                  result[group].timeline
                    .filter((point) => point.censored > 0)
                    .map((point, index) => (
                      <path
                        key={index}
                        data-censor={group}
                        d={`M${px(point.timeMonths) - 2},${py(point.survival)}h4M${px(point.timeMonths)},${py(point.survival) - 2}v4`}
                        stroke={color(group)}
                        strokeWidth="0.9"
                        fill="none"
                      />
                    ))}
              </g>
            ),
          )}
        </g>
        {settings.showLegend &&
          element(
            `legend.${ep}`,
            <g
              transform={`translate(${right - 91},${g.top + 8})`}
              fontWeight={legendStyle.bold === false ? 400 : 700}
              fontStyle={legendStyle.italic ? "italic" : "normal"}
            >
              {(["low", "high"] as const).map((group, i) => {
                const label = legendEntry(settings, result, group);
                return (
                  <g key={group} transform={`translate(0,${13 * i})`}>
                    <line
                      x1="0"
                      y1="0"
                      x2="18"
                      y2="0"
                      stroke={color(group)}
                      strokeWidth={lineWidth(group)}
                      strokeDasharray={dash(group)}
                    />
                    {element(
                      `label.${group}.${ep}`,
                      <RichSvgText
                        id={`label.${group}.${ep}`}
                        value={label.value}
                        x={23}
                        y={3}
                        size={8 * settings.fontScale}
                        anchor="start"
                        style={label.style}
                      />,
                    )}
                  </g>
                );
              })}
            </g>,
          )}
        {element(
          `statistics.${ep}`,
          <g
            fill={statStyle.color ?? "#111"}
            fontSize={statStyle.fontSize ?? 8.5 * settings.fontScale}
            fontWeight={statStyle.bold === false ? 400 : 700}
            fontStyle={statStyle.italic ? "italic" : "normal"}
          >
            {statText && (
              <text x={right - 5} y={bottom - 20} textAnchor="end">
                {statText}
              </text>
            )}
            {settings.showHr && (
              <text x={right - 5} y={bottom - 8} textAnchor="end">
                HR=
                {Number.isFinite(result.coxHr) ? result.coxHr.toFixed(2) : "NA"}
              </text>
            )}
          </g>,
        )}
        {settings.riskTable && (
          <g data-risk-table={ep} fontSize={7 * settings.fontScale}>
            <text x={g.left} y={bottom + 43}>
              Number at risk
            </text>
            {(["low", "high"] as const).map((group, i) => (
              <g key={group} fill={color(group)}>
                <text x={g.left - 8} y={bottom + 55 + i * 11} textAnchor="end">
                  {group === "low" ? settings.lowLabel : settings.highLabel}
                </text>
                {xTicks.map((tick) => (
                  <text
                    key={tick}
                    x={px(timeInMonths(tick, settings.unit))}
                    y={bottom + 55 + i * 11}
                    textAnchor="middle"
                  >
                    {atRisk(result[group], timeInMonths(tick, settings.unit))}
                  </text>
                ))}
              </g>
            ))}
          </g>
        )}
      </g>
    );
  }

  return (
    <>
      <title id="plot-title">
        {analysis.gene} {cohortDisplayName(analysis.cohort)} survival
      </title>
      <desc id="plot-description">
        Kaplan–Meier survival curves. {analysis.groupingLabel}. Unavailable
        outcomes are labeled. Hazard ratios compare higher with lower
        expression.
      </desc>
      <metadata>
        {JSON.stringify({
          gene: analysis.gene,
          cohort: analysis.cohort,
          dataVersion: analysis.dataVersion,
          grouping: analysis.grouping,
          statisticsVersion: analysis.statisticsVersion,
          provenance: analysis.provenance,
        })}
      </metadata>
      <rect width={width} height={height} fill="#fff" />
      {text(
        "title",
        `${analysis.gene} ${cohortDisplayName(analysis.cohort)} survival`,
        width / 2,
        14,
        12,
      )}
      {text(
        "source",
        `Expression: ${analysis.sourceExpression}; endpoints: ${analysis.sourceSurvival}`,
        width / 2,
        33,
        9,
      )}
      {analysis.grouping.kind !== "median" &&
        text("grouping", analysis.groupingLabel, width / 2, 48, 8)}
      {settings.endpoints.map((ep) => panel(analysis.endpoints[ep]))}
      {settings.annotations.map((item) => {
        const id = `annotation.${item.id}`,
          style = objectStyle(settings, id);
        if (style.hidden) return null;
        return (
          <g key={id} data-element={id} pointerEvents="bounding-box">
            {item.kind === "text" ? (
              <RichSvgText
                id={id}
                value={item.text}
                x={item.x * width}
                y={item.y * height}
                size={item.fontSize}
                anchor="start"
                style={style}
              />
            ) : (
              <>
                <defs>
                  <marker
                    id={`arrow-${item.id}`}
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,6 L7,3 z" fill={item.color} />
                  </marker>
                </defs>
                <line
                  x1={item.x * width}
                  y1={item.y * height}
                  x2={item.x2 * width}
                  y2={item.y2 * height}
                  stroke={item.color}
                  strokeWidth={item.lineWidth}
                  markerEnd={
                    item.kind === "arrow" ? `url(#arrow-${item.id})` : undefined
                  }
                />
              </>
            )}
          </g>
        );
      })}
    </>
  );
});
export const SurvivalPlot = forwardRef<SVGSVGElement, Props>(
  function SurvivalPlot({ analysis, settings: supplied, editor }, ref) {
    const settings = supplied ?? defaultFigure();
    const svgRef = useRef<SVGSVGElement>(null);
    useImperativeHandle(ref, () => svgRef.current!, []);
    const interaction = usePlotInteraction(svgRef, settings, editor);
    return (
      <svg
        ref={svgRef}
        className="survival-plot"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${settings.widthIn * 72} ${settings.heightIn * 72}`}
        width={`${settings.widthIn}in`}
        height={`${settings.heightIn}in`}
        tabIndex={0}
        role="img"
        aria-labelledby="plot-title plot-description"
        {...interaction.events}
        style={{
          background: "transparent",
          color: "#111",
          fontFamily: `SurvScope ${settings.fontFamily}`,
          fontWeight: 700,
          touchAction: editor ? "none" : undefined,
        }}
      >
        <PlotArtwork analysis={analysis} settings={settings} />
        {interaction.selection}
      </svg>
    );
  },
);
