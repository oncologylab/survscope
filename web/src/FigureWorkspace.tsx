import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { flushSync } from "react-dom";
import { SurvivalPlot } from "./SurvivalPlot";
import { FigureEditor } from "./FigureEditor";
import { InlineTextEditor } from "./InlineTextEditor";
import type { TextTarget } from "./InlineTextEditor";
import { defaultFigure, elementName } from "./figure";
import type { EditorTool, FigureSettings } from "./figure";
import type { SurvivalAnalysis } from "./types";
import type { useHistory } from "./useHistory";
import {
  alignObjects,
  locked,
  moveObjects,
  objectBounds,
  objectIds,
  objectStyle,
  parentId,
  updateText,
} from "./editorModel";

type History = ReturnType<typeof useHistory<FigureSettings>>;
interface Props {
  analysis: SurvivalAnalysis | null;
  history: History;
  plotRef: RefObject<SVGSVGElement>;
  analysisControls: ReactNode;
  status: string;
  pending: boolean;
  busy: boolean;
  snapshot: boolean;
  onOpen: () => void;
  onNew: () => void;
  onSave: () => void;
  onPreset: () => void;
  onHelp: () => void;
  onCite: () => void;
  onExport: (kind: "svg" | "pdf" | "png" | "json") => void;
  resetKey: number;
}
interface WorkspacePreferences {
  analysis: boolean;
  properties: boolean;
  left: number;
  right: number;
  snap: boolean;
}
function defaults(): WorkspacePreferences {
  return {
    analysis: window.innerWidth >= 1440,
    properties: window.innerWidth >= 1024,
    left: 280,
    right: 320,
    snap: true,
  };
}
function loadPreferences() {
  const d = defaults();
  try {
    const p = JSON.parse(localStorage.getItem("survscope-workspace") ?? "{}");
    return {
      ...d,
      ...(typeof p.snap === "boolean" ? { snap: p.snap } : {}),
      ...(window.innerWidth >= 1440 && typeof p.analysis === "boolean"
        ? { analysis: p.analysis }
        : {}),
      ...(window.innerWidth >= 1024 && typeof p.properties === "boolean"
        ? { properties: p.properties }
        : {}),
      left: Math.max(240, Math.min(440, Number(p.left) || d.left)),
      right: Math.max(240, Math.min(440, Number(p.right) || d.right)),
    };
  } catch {
    return d;
  }
}
export function FigureWorkspace(p: Props) {
  const { analysis, history, plotRef } = p,
    settings = history.value;
  const [prefs, setPrefs] = useState(loadPreferences),
    [tab, setTab] = useState<"properties" | "layers">("properties");
  const [selection, setSelection] = useState<string[]>([]),
    [tool, setTool] = useState<EditorTool>("select"),
    [space, setSpace] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null),
    [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [textTarget, setTextTarget] = useState<TextTarget | null>(null),
    [artboard, setArtboard] = useState(false);
  const stage = useRef<HTMLDivElement>(null),
    pan = useRef<{ x: number; y: number; left: number; top: number } | null>(
      null,
    );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const clipboard = useRef<{
    annotations: FigureSettings["annotations"];
    styles: FigureSettings["elements"];
  } | null>(null);
  const selected = selection.at(-1) ?? null,
    activeTool = space ? "hand" : tool;
  const fit = Math.max(
    0.1,
    Math.min(
      16,
      Math.min(
        (stageSize.width - 48) / (settings.widthIn * 96),
        (stageSize.height - 48) / (settings.heightIn * 96),
      ),
    ),
  );
  const scale = zoom ?? fit;
  useEffect(() => {
    try {
      localStorage.setItem("survscope-workspace", JSON.stringify(prefs));
    } catch {
      /* Storage may be disabled. */
    }
  }, [prefs]);
  useEffect(() => {
    setSelection([]);
    setTextTarget(null);
    setZoom(null);
  }, [p.resetKey]);
  useEffect(() => {
    const medium = window.matchMedia("(min-width:1440px)"),
      large = window.matchMedia("(min-width:1024px)");
    const change = () =>
      setPrefs((v) => ({
        ...v,
        analysis: medium.matches,
        properties: large.matches,
      }));
    medium.addEventListener("change", change);
    large.addEventListener("change", change);
    return () => {
      medium.removeEventListener("change", change);
      large.removeEventListener("change", change);
    };
  }, []);
  useLayoutEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setStageSize({ width: r.width, height: r.height });
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  function zoomAt(factor: number, x?: number, y?: number) {
    const el = stage.current;
    if (!el) return;
    const rect = el.getBoundingClientRect(),
      cx = (x ?? rect.left + rect.width / 2) - rect.left,
      cy = (y ?? rect.top + rect.height / 2) - rect.top;
    const oldLeft = Math.max(
        24,
        (el.clientWidth - settings.widthIn * 96 * scale) / 2,
      ),
      oldTop = Math.max(
        24,
        (el.clientHeight - settings.heightIn * 96 * scale) / 2,
      );
    const px = (el.scrollLeft + cx - oldLeft) / scale,
      py = (el.scrollTop + cy - oldTop) / scale,
      next = Math.max(0.1, Math.min(16, scale * factor));
    setZoom(next);
    requestAnimationFrame(() => {
      el.scrollLeft =
        px * next +
        Math.max(24, (el.clientWidth - settings.widthIn * 96 * next) / 2) -
        cx;
      el.scrollTop =
        py * next +
        Math.max(24, (el.clientHeight - settings.heightIn * 96 * next) / 2) -
        cy;
    });
  }
  function editText(
    node: SVGTextElement,
    click?: { left: number; top: number },
  ) {
    const id = node.dataset.textId!;
    const parent =
      node.closest<SVGGraphicsElement>("[data-element]")?.dataset.element;
    if (locked(settings, id) || (parent && locked(settings, parent))) return;
    if (id.startsWith("label.")) setSelection([id]);
    const style = objectStyle(settings, id),
      matrix = plotRef
        .current!.getScreenCTM()!
        .inverse()
        .multiply(node.getScreenCTM()!);
    const computed = getComputedStyle(node);
    setTextTarget({
      id,
      value:
        style.text ??
        (id === "label.low"
          ? settings.lowLabel
          : id === "label.high"
            ? settings.highLabel
            : (node.dataset.textValue ?? "")),
      runs: style.runs,
      style,
      matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
      x: Number(node.getAttribute("x")),
      y: Number(node.getAttribute("y")),
      width: node.getBBox().width,
      fontSize: Number(node.getAttribute("font-size")) || 10,
      family: computed.fontFamily,
      anchor: node.getAttribute("text-anchor") ?? "start",
      click,
    });
  }
  function copy() {
    const ids = selection.filter((id) => !locked(settings, id));
    const annotations = settings.annotations.filter((a) =>
      ids.includes(`annotation.${a.id}`),
    );
    clipboard.current = {
      annotations: structuredClone(annotations),
      styles: Object.fromEntries(
        annotations.map((a) => [
          a.id,
          structuredClone(settings.elements[`annotation.${a.id}`] ?? {}),
        ]),
      ),
    };
  }
  function paste() {
    if (!clipboard.current || !clipboard.current.annotations.length) return;
    const next = structuredClone(settings),
      ids: string[] = [];
    for (const a of clipboard.current.annotations.slice(
      0,
      100 - next.annotations.length,
    )) {
      const id = crypto.randomUUID();
      next.annotations.push({
        ...a,
        id,
        x: a.x + 10 / (settings.widthIn * 72),
        y: a.y + 10 / (settings.heightIn * 72),
        x2: a.x2 + 10 / (settings.widthIn * 72),
        y2: a.y2 + 10 / (settings.heightIn * 72),
      });
      next.elements[`annotation.${id}`] = structuredClone(
        clipboard.current.styles[a.id],
      );
      ids.push(`annotation.${id}`);
    }
    history.change(next);
    setSelection(ids);
  }
  function remove() {
    const ids = selection.filter((id) => !locked(settings, id));
    const next = structuredClone(settings);
    next.annotations = next.annotations.filter(
      (a) => !ids.includes(`annotation.${a.id}`),
    );
    for (const id of ids.filter((id) => id.startsWith("annotation.")))
      delete next.elements[id];
    history.change(next);
    setSelection(selection.filter((id) => !id.startsWith("annotation.")));
  }
  function duplicate() {
    copy();
    paste();
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as Element)?.closest(
          'input,textarea,select,[contenteditable="true"],dialog',
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpace(true);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (["z", "y", "c", "v", "x"].includes(k)) {
          e.preventDefault();
          if (k === "z") e.shiftKey ? history.redo() : history.undo();
          if (k === "y") history.redo();
          if (k === "c") copy();
          if (k === "v") paste();
          if (k === "x") {
            copy();
            remove();
          }
        }
        return;
      }
      const tools: Record<string, EditorTool> = {
        v: "select",
        t: "type",
        h: "hand",
        z: "zoom",
      };
      if (tools[e.key.toLowerCase()]) {
        setTool(tools[e.key.toLowerCase()]);
        return;
      }
      if (e.key === "Escape") {
        setSelection([]);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
        return;
      }
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (delta[e.key] && selection.length) {
        e.preventDefault();
        const [x, y] = delta[e.key];
        history.change(
          moveObjects(
            settings,
            selection,
            x * (e.shiftKey ? 10 : 1),
            y * (e.shiftKey ? 10 : 1),
          ),
        );
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    const blur = () => setSpace(false);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });
  function align(action: string) {
    if (!plotRef.current) return;
    const boxes = new Map(
      selection.flatMap((id) => {
        const b = objectBounds(plotRef.current!, id);
        return b ? [[id, b] as const] : [];
      }),
    );
    history.change(alignObjects(settings, selection, boxes, action, artboard));
  }
  function reorder(front: boolean) {
    const next = structuredClone(settings),
      selected = next.annotations.filter(
        (a) =>
          selection.includes(`annotation.${a.id}`) &&
          !locked(settings, `annotation.${a.id}`),
      ),
      rest = next.annotations.filter((a) => !selected.includes(a));
    next.annotations = front ? [...rest, ...selected] : [...selected, ...rest];
    history.change(next);
  }
  function resizeDock(e: React.PointerEvent, side: "left" | "right") {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const initial = prefs[side],
      x = e.clientX;
    const target = e.currentTarget;
    const move = (event: PointerEvent) =>
      setPrefs((v) => ({
        ...v,
        [side]: Math.max(
          240,
          Math.min(
            440,
            initial + (event.clientX - x) * (side === "left" ? 1 : -1),
          ),
        ),
      }));
    const end = () => {
      target.removeEventListener("pointermove", move as EventListener);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move as EventListener);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }
  return (
    <div
      className="app-shell studio"
      style={
        {
          "--analysis-width": `${prefs.left}px`,
          "--properties-width": `${prefs.right}px`,
        } as CSSProperties
      }
    >
      <header className="masthead">
        <a className="brand" href={import.meta.env.BASE_URL}>
          SurvScope
        </a>
        <nav className="header-actions" aria-label="Figure actions">
          <button type="button" onClick={p.onNew}>
            New analysis
          </button>
          <button type="button" onClick={p.onOpen}>
            Open project
          </button>
          <button
            type="button"
            onClick={p.onSave}
            disabled={!analysis || p.busy}
          >
            Save project
          </button>
          <button
            type="button"
            onClick={history.undo}
            disabled={!history.canUndo}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={history.redo}
            disabled={!history.canRedo}
          >
            Redo
          </button>
          <button type="button" onClick={p.onCite} disabled={!analysis}>
            Cite this analysis
          </button>
          <button type="button" onClick={p.onHelp}>
            How to use
          </button>
        </nav>
      </header>
      <main>
        <section
          className={`workspace studio-workspace ${prefs.analysis ? "analysis-open" : ""} ${prefs.properties ? "properties-open" : ""}`}
          aria-label="Survival plot workspace"
        >
          <nav className="tools-rail" aria-label="Figure tools">
            {(
              [
                ["select", "Selection", "V", "↖"],
                ["type", "Type", "T", "T"],
                ["hand", "Hand", "H", "✋"],
                ["zoom", "Zoom", "Z", "⌕"],
                ["line", "Line", "", "╱"],
                ["arrow", "Arrow", "", "↗"],
              ] as const
            ).map(([value, label, key, icon]) => (
              <button
                type="button"
                key={value}
                title={`${label}${key ? ` (${key})` : ""}`}
                aria-label={`${label} tool`}
                aria-pressed={activeTool === value}
                onClick={() => setTool(value)}
              >
                {icon}
              </button>
            ))}
            <hr />
            <button
              type="button"
              title="Analysis panel"
              aria-label="Toggle Analysis panel"
              aria-pressed={prefs.analysis}
              onClick={() => setPrefs((v) => ({ ...v, analysis: !v.analysis }))}
            >
              A
            </button>
            <button
              type="button"
              title="Properties and Layers"
              aria-label="Toggle Properties panel"
              aria-pressed={prefs.properties}
              onClick={() =>
                setPrefs((v) => ({ ...v, properties: !v.properties }))
              }
            >
              ☷
            </button>
          </nav>
          {prefs.analysis && (
            <div className="analysis-dock">
              <div className="dock-heading">
                <strong>Analysis</strong>
                <button
                  type="button"
                  aria-label="Close Analysis panel"
                  onClick={() => setPrefs((v) => ({ ...v, analysis: false }))}
                >
                  ×
                </button>
              </div>
              {p.analysisControls}
              <div
                role="separator"
                aria-label="Resize Analysis panel"
                aria-orientation="vertical"
                aria-valuemin={240}
                aria-valuemax={440}
                aria-valuenow={prefs.left}
                tabIndex={0}
                className="dock-resizer right"
                onPointerDown={(e) => resizeDock(e, "left")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    e.stopPropagation();
                    setPrefs((v) => ({
                      ...v,
                      left: Math.max(
                        240,
                        Math.min(
                          440,
                          v.left + (e.key === "ArrowRight" ? 10 : -10),
                        ),
                      ),
                    }));
                  }
                }}
              />
            </div>
          )}
          <section className="result">
            <div className="result-heading">
              <div>
                <h2>
                  {analysis
                    ? `${analysis.gene} · ${analysis.cohort}`
                    : "Your survival figure"}
                </h2>
                <p>
                  {p.snapshot
                    ? "Saved project"
                    : "Select, edit, and arrange directly on the figure."}
                </p>
              </div>
              <div className="export-buttons">
                {(["svg", "pdf", "png", "json"] as const).map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    disabled={!analysis || p.busy}
                    onClick={() => p.onExport(kind)}
                  >
                    {kind.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="zoom-toolbar">
              <button
                type="button"
                onClick={() => setZoom(null)}
                aria-pressed={zoom === null}
              >
                Fit
              </button>
              <button type="button" onClick={() => zoomAt(1 / scale)}>
                100%
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => zoomAt(0.8)}
              >
                −
              </button>
              <span aria-label="Magnification">{Math.round(scale * 100)}%</span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => zoomAt(1.25)}
              >
                +
              </button>
              <label className="check">
                <input
                  type="checkbox"
                  aria-label="Snap to objects"
                  checked={prefs.snap}
                  onChange={(e) =>
                    setPrefs((v) => ({ ...v, snap: e.target.checked }))
                  }
                />
                Snap
              </label>
              <span className="canvas-hint">
                Double-click text to edit · Space to pan
              </span>
            </div>
            {p.pending && (
              <p className="pending-status">
                Selections changed. Create a survival plot to update this
                figure.
              </p>
            )}
            {p.status && (
              <p className="global-status" role="status">
                {p.status}
              </p>
            )}
            <div
              ref={stage}
              className={`plot-stage ${zoom === null ? "fitted" : "zoomed"} ${activeTool === "hand" ? "panning" : ""} tool-${activeTool}`}
              onPointerDownCapture={(e) => {
                if (activeTool !== "hand" || e.button !== 0 || !stage.current)
                  return;
                e.preventDefault();
                e.stopPropagation();
                pan.current = {
                  x: e.clientX,
                  y: e.clientY,
                  left: stage.current.scrollLeft,
                  top: stage.current.scrollTop,
                };
                stage.current.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (pan.current && stage.current) {
                  stage.current.scrollLeft =
                    pan.current.left + pan.current.x - e.clientX;
                  stage.current.scrollTop =
                    pan.current.top + pan.current.y - e.clientY;
                }
              }}
              onPointerUp={(e) => {
                pan.current = null;
                if (stage.current?.hasPointerCapture(e.pointerId))
                  stage.current.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                pan.current = null;
              }}
            >
              {analysis ? (
                <div
                  className="canvas-surround"
                  style={{
                    width: Math.max(
                      stageSize.width,
                      settings.widthIn * 96 * scale + 48,
                    ),
                    height: Math.max(
                      stageSize.height,
                      settings.heightIn * 96 * scale + 48,
                    ),
                  }}
                >
                  <div
                    className="figure-canvas"
                    style={{
                      width: settings.widthIn * 96 * scale,
                      height: settings.heightIn * 96 * scale,
                    }}
                  >
                    <SurvivalPlot
                      ref={plotRef}
                      analysis={analysis}
                      settings={settings}
                      editor={{
                        selection,
                        select: setSelection,
                        tool: activeTool,
                        snap: prefs.snap,
                        change: history.change,
                        editText,
                        zoomAt,
                      }}
                    />
                    {textTarget && (
                      <InlineTextEditor
                        target={textTarget}
                        scale={(scale * 96) / 72}
                        commit={(runs) =>
                          flushSync(() => {
                            history.change(
                              updateText(
                                settingsRef.current,
                                textTarget.id,
                                runs,
                              ),
                            );
                            setTextTarget(null);
                          })
                        }
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="plot-placeholder">
                  <span>KM</span>
                  <p>Choose a gene and cohort in Analysis.</p>
                  <button
                    type="button"
                    onClick={() => setPrefs((v) => ({ ...v, analysis: true }))}
                  >
                    Open Analysis
                  </button>
                </div>
              )}
            </div>
            <div className="workspace-status">
              <span className="data-version">
                {settings.widthIn} × {settings.heightIn} in ·{" "}
                {analysis ? `Data ${analysis.dataVersion}` : "No figure"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPrefs(defaults());
                  setZoom(null);
                  setTool("select");
                }}
              >
                Reset workspace
              </button>
            </div>
          </section>
          {prefs.properties && (
            <div className="properties-dock">
              <div className="dock-heading">
                <div role="tablist" aria-label="Figure inspector">
                  <button
                    role="tab"
                    aria-selected={tab === "properties"}
                    onClick={() => setTab("properties")}
                  >
                    Properties
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "layers"}
                    onClick={() => setTab("layers")}
                  >
                    Layers
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Close Properties panel"
                  onClick={() => setPrefs((v) => ({ ...v, properties: false }))}
                >
                  ×
                </button>
              </div>
              {analysis && (
                <div className="inspector-content">
                  <details className="arrange-controls">
                    <summary>Arrange selection ({selection.length})</summary>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={artboard}
                        onChange={(e) => setArtboard(e.target.checked)}
                      />
                      Align to artboard
                    </label>
                    <div className="button-row">
                      {[
                        "left",
                        "center",
                        "right",
                        "top",
                        "middle",
                        "bottom",
                        "distribute-x",
                        "distribute-y",
                      ].map((action) => (
                        <button
                          type="button"
                          key={action}
                          disabled={
                            !selection.length ||
                            (action.startsWith("distribute") &&
                              selection.length < 3)
                          }
                          onClick={() => align(action)}
                        >
                          {action
                            .replace("distribute-x", "Distribute horizontally")
                            .replace("distribute-y", "Distribute vertically")}
                        </button>
                      ))}
                    </div>
                    <div className="button-row">
                      <button onClick={copy}>Copy</button>
                      <button onClick={paste}>Paste</button>
                      <button onClick={duplicate}>Duplicate</button>
                      <button onClick={() => reorder(true)}>
                        Bring to front
                      </button>
                      <button onClick={() => reorder(false)}>
                        Send to back
                      </button>
                      <button onClick={remove}>Delete annotations</button>
                    </div>
                  </details>
                  {tab === "properties" ? (
                    <FigureEditor
                      settings={settings}
                      analysis={analysis}
                      selected={selected}
                      select={(id) => setSelection(id ? [id] : [])}
                      change={history.change}
                      savePreset={p.onPreset}
                      openFile={p.onOpen}
                    />
                  ) : (
                    <div
                      className="layers-list"
                      role="tree"
                      aria-label="Figure objects"
                    >
                      {objectIds(settings, analysis).map((id) => (
                        <div
                          key={id}
                          className={`layer-row ${selection.includes(id) ? "selected" : ""}`}
                          style={{ paddingLeft: parentId(id) ? 18 : 4 }}
                          role="treeitem"
                          aria-level={parentId(id) ? 2 : 1}
                          aria-selected={selection.includes(id)}
                        >
                          <button
                            className="layer-select"
                            onClick={(e) =>
                              setSelection(
                                e.shiftKey
                                  ? selection.includes(id)
                                    ? selection.filter((x) => x !== id)
                                    : [...selection, id]
                                  : [id],
                              )
                            }
                          >
                            {elementName(id)}
                          </button>
                          {(["hidden", "locked"] as const).map((key) => (
                            <button
                              key={key}
                              aria-label={`${key === "hidden" ? "Hide" : "Lock"} ${elementName(id)}`}
                              aria-pressed={!!settings.elements[id]?.[key]}
                              onClick={() =>
                                history.change({
                                  ...settings,
                                  elements: {
                                    ...settings.elements,
                                    [id]: {
                                      ...settings.elements[id],
                                      [key]: !settings.elements[id]?.[key],
                                    },
                                  },
                                })
                              }
                            >
                              {key === "hidden"
                                ? settings.elements[id]?.hidden
                                  ? "○"
                                  : "●"
                                : settings.elements[id]?.locked
                                  ? "◆"
                                  : "◇"}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    className="reset-figure"
                    type="button"
                    onClick={() => {
                      history.change(defaultFigure());
                      setSelection([]);
                    }}
                  >
                    Reset figure
                  </button>
                </div>
              )}
              <div
                role="separator"
                aria-label="Resize Properties panel"
                aria-orientation="vertical"
                aria-valuemin={240}
                aria-valuemax={440}
                aria-valuenow={prefs.right}
                tabIndex={0}
                className="dock-resizer left"
                onPointerDown={(e) => resizeDock(e, "right")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    e.stopPropagation();
                    setPrefs((v) => ({
                      ...v,
                      right: Math.max(
                        240,
                        Math.min(
                          440,
                          v.right + (e.key === "ArrowLeft" ? 10 : -10),
                        ),
                      ),
                    }));
                  }
                }}
              />
            </div>
          )}
        </section>
      </main>
      <footer>
        <p>SurvScope · Research software</p>
        <a href="https://github.com/oncologylab/survscope">Source on GitHub</a>
      </footer>
    </div>
  );
}
