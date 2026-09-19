import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cohortDisplayName } from "./cohorts";
import { atRisk, confidenceBounds, formatP } from "./statistics";
import { dashArray, defaultFigure, displayTime, timeInMonths } from "./figure";
import type { FigureSettings } from "./figure";
import type {
  Curve,
  Endpoint,
  EndpointResult,
  SurvivalAnalysis,
} from "./types";

interface Geometry {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface PlotEditor {
  selected: string | null;
  select: (id: string | null) => void;
  begin: () => void;
  preview: (settings: FigureSettings) => void;
  commit: () => void;
  change: (settings: FigureSettings) => void;
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

export const SurvivalPlot = forwardRef<SVGSVGElement, Props>(
  function SurvivalPlot({ analysis, settings: supplied, editor }, ref) {
    const settings = supplied ?? defaultFigure();
    const width = settings.widthIn * 72,
      height = settings.heightIn * 72;
    const svgRef = useRef<SVGSVGElement>(null);
    useImperativeHandle(ref, () => svgRef.current!, []);
    const [selectionBox, setSelectionBox] = useState<Geometry | null>(null);
    const drag = useRef<{
      id: string;
      x: number;
      y: number;
      original: FigureSettings;
      resize: boolean;
    } | null>(null);

    function point(event: ReactPointerEvent) {
      const matrix = svgRef.current?.getScreenCTM();
      return matrix
        ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
            matrix.inverse(),
          )
        : new DOMPoint();
    }
    function begin(event: ReactPointerEvent, id: string, resize = false) {
      if (!editor || event.button !== 0) return;
      event.stopPropagation();
      editor.select(id);
      if (id.startsWith("curve.")) return;
      const p = point(event);
      editor.begin();
      drag.current = {
        id,
        x: p.x,
        y: p.y,
        original: structuredClone(settings),
        resize,
      };
      svgRef.current?.setPointerCapture(event.pointerId);
    }
    function move(event: ReactPointerEvent) {
      if (!editor || !drag.current) return;
      const { id, x, y, original, resize } = drag.current,
        p = point(event);
      const dx = p.x - x,
        dy = p.y - y,
        next = structuredClone(original);
      if (id.startsWith("panel.")) {
        const box = next.panels[id.split(".")[1] as Endpoint];
        if (resize) {
          box.width = Math.max(
            Math.min(30 / width, 1 - box.x),
            Math.min(1 - box.x, box.width + dx / width),
          );
          box.height = Math.max(
            Math.min(30 / height, 1 - box.y),
            Math.min(1 - box.y, box.height + dy / height),
          );
        } else {
          box.x = Math.max(0, Math.min(1 - box.width, box.x + dx / width));
          box.y = Math.max(0, Math.min(1 - box.height, box.y + dy / height));
        }
      } else if (id.startsWith("annotation.")) {
        const item = next.annotations.find((a) => `annotation.${a.id}` === id)!;
        if (!resize) {
          item.x += dx / width;
          item.y += dy / height;
        }
        item.x2 += dx / width;
        item.y2 += dy / height;
      } else {
        const style = (next.elements[id] ??= {});
        style.dx = (style.dx ?? 0) + dx;
        style.dy = (style.dy ?? 0) + dy;
      }
      editor.preview(next);
    }
    function end(event: ReactPointerEvent) {
      if (!drag.current) return;
      drag.current = null;
      if (svgRef.current?.hasPointerCapture(event.pointerId))
        svgRef.current.releasePointerCapture(event.pointerId);
      editor?.commit();
    }
    useLayoutEffect(() => {
      const node = [
        ...(svgRef.current?.querySelectorAll<SVGGElement>("[data-element]") ??
          []),
      ].find((element) => element.dataset.element === editor?.selected);
      const matrix = svgRef.current?.getScreenCTM();
      if (!node || !matrix) {
        setSelectionBox(null);
        return;
      }
      const rect = node.getBoundingClientRect(),
        inverse = matrix.inverse();
      const top = new DOMPoint(rect.left, rect.top).matrixTransform(inverse);
      const bottom = new DOMPoint(rect.right, rect.bottom).matrixTransform(
        inverse,
      );
      setSelectionBox({
        left: top.x,
        top: top.y,
        width: bottom.x - top.x,
        height: bottom.y - top.y,
      });
    }, [editor?.selected, settings, analysis]);

    function element(id: string, children: ReactNode) {
      const style = settings.elements[id] ?? {};
      if (style.hidden) return null;
      return (
        <g
          key={id}
          data-element={id}
          transform={`translate(${style.dx ?? 0},${style.dy ?? 0})`}
          onPointerDown={(event) => begin(event, id)}
          pointerEvents={
            editor && !id.startsWith("curve.") ? "bounding-box" : undefined
          }
          style={
            editor
              ? { cursor: id.startsWith("curve.") ? "pointer" : "move" }
              : undefined
          }
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
      const style = settings.elements[id] ?? {};
      return element(
        id,
        <text
          x={x}
          y={y}
          textAnchor={anchor}
          fontSize={style.fontSize ?? size * settings.fontScale}
          fill={style.color ?? "#111"}
          fontWeight={style.bold === false ? 400 : 700}
          fontStyle={style.italic ? "italic" : "normal"}
          transform={rotate ? `rotate(-90 ${x} ${y})` : undefined}
        >
          {(style.text ?? value).split("\n").map((line, i) => (
            <tspan key={i} x={x} dy={i ? "1.2em" : 0}>
              {line || " "}
            </tspan>
          ))}
        </text>,
      );
    }
    function panel(result: EndpointResult): ReactNode {
      const ep = result.endpoint,
        box = settings.panels[ep];
      const geometry: Geometry = {
        left: box.x * width,
        top: box.y * height,
        width: box.width * width,
        height: box.height * height,
      };
      if (result.quality === "unavailable")
        return (
          <g
            key={ep}
            data-element={`panel.${ep}`}
            onPointerDown={(e) => begin(e, `panel.${ep}`)}
          >
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
        settings.showQ ? `q=${formatP(result.logrankQ)}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return (
        <g
          key={ep}
          data-element={`panel.${ep}`}
          onPointerDown={(event) => begin(event, `panel.${ep}`)}
        >
          {editor && (
            <rect
              x={g.left}
              y={g.top}
              width={g.width}
              height={geometry.height}
              fill="transparent"
              data-editor-only="true"
            />
          )}
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
            {(["low", "high"] as const).map((group) => (
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
            ))}
          </g>
          {settings.showLegend &&
            element(
              `legend.${ep}`,
              <g
                transform={`translate(${right - 91},${g.top + 8})`}
                fontWeight={legendStyle.bold === false ? 400 : 700}
                fontStyle={legendStyle.italic ? "italic" : "normal"}
              >
                {(["low", "high"] as const).map((group, i) => (
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
                    <text
                      x="23"
                      y="3"
                      fontSize={legendStyle.fontSize ?? 8 * settings.fontScale}
                      fill={legendStyle.color ?? "#111"}
                    >
                      {group === "low" ? settings.lowLabel : settings.highLabel}{" "}
                      n={result[group].n}, e={result[group].events}
                    </text>
                  </g>
                ))}
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
                  {Number.isFinite(result.coxHr)
                    ? result.coxHr.toFixed(2)
                    : "NA"}
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
                  <text
                    x={g.left - 8}
                    y={bottom + 55 + i * 11}
                    textAnchor="end"
                  >
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
      <svg
        ref={svgRef}
        className="survival-plot"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${width} ${height}`}
        width={`${settings.widthIn}in`}
        height={`${settings.heightIn}in`}
        role="img"
        aria-labelledby="plot-title plot-description"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerDown={() => editor?.select(null)}
        style={{
          background: "transparent",
          color: "#111",
          fontFamily: `SurvScope ${settings.fontFamily}`,
          fontWeight: 700,
          aspectRatio: `${settings.widthIn} / ${settings.heightIn}`,
          touchAction: editor ? "none" : undefined,
        }}
      >
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
        {settings.annotations.map((item) => (
          <g
            key={item.id}
            data-element={`annotation.${item.id}`}
            pointerEvents={
              editor && item.kind === "text" ? "bounding-box" : undefined
            }
            onPointerDown={(event) => begin(event, `annotation.${item.id}`)}
          >
            {item.kind === "text" ? (
              <text
                x={item.x * width}
                y={item.y * height}
                fill={item.color}
                fontSize={item.fontSize}
              >
                {item.text.split("\n").map((line, i) => (
                  <tspan key={i} x={item.x * width} dy={i ? "1.2em" : 0}>
                    {line || " "}
                  </tspan>
                ))}
              </text>
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
        ))}
        {editor?.selected && selectionBox && (
          <g data-editor-only="true">
            <rect
              x={selectionBox.left - 3}
              y={selectionBox.top - 3}
              width={selectionBox.width + 6}
              height={selectionBox.height + 6}
              fill="none"
              stroke="#147d77"
              strokeWidth="1"
              strokeDasharray="3 2"
              pointerEvents="none"
            />
            {editor.selected.startsWith("panel.") &&
              (() => {
                const box =
                  settings.panels[editor.selected!.split(".")[1] as Endpoint];
                return (
                  <rect
                    aria-label="Resize panel"
                    x={(box.x + box.width) * width - 3}
                    y={(box.y + box.height) * height - 3}
                    width="6"
                    height="6"
                    fill="#147d77"
                    style={{ cursor: "nwse-resize" }}
                    onPointerDown={(event) =>
                      begin(event, editor.selected!, true)
                    }
                  />
                );
              })()}
            {editor.selected.startsWith("annotation.") &&
              (() => {
                const item = settings.annotations.find(
                  (a) => `annotation.${a.id}` === editor.selected,
                );
                return (
                  item &&
                  item.kind !== "text" && (
                    <circle
                      aria-label="Move line endpoint"
                      cx={item.x2 * width}
                      cy={item.y2 * height}
                      r="3"
                      fill="#147d77"
                      onPointerDown={(event) =>
                        begin(event, editor.selected!, true)
                      }
                    />
                  )
                );
              })()}
          </g>
        )}
      </svg>
    );
  },
);
