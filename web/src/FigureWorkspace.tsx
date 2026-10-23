import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { flushSync } from "react-dom";
import { SurvivalPlot } from "./SurvivalPlot";
import { FigureEditor } from "./FigureEditor";
import { InlineTextEditor } from "./InlineTextEditor";
import { IconButton } from "./IconButton";
import { LayersPanel } from "./LayersPanel";
import { defaultText, legendEntry } from "./plotLabels";
import type { TextTarget } from "./InlineTextEditor";
import { defaultFigure } from "./figure";
import type { EditorTool, FigureSettings } from "./figure";
import type { Endpoint, SurvivalAnalysis } from "./types";
import type { History } from "./useHistory";
import {
  alignObjects,
  copyAnnotations,
  locked,
  moveObjects,
  objectBounds,
  objectStyle,
  pasteAnnotations,
  removeAnnotations,
  reorderAnnotations,
  updateText,
} from "./editorModel";
import type { AnnotationClipboard } from "./editorModel";

interface Props {
  analysis: SurvivalAnalysis | null;
  history: History<FigureSettings>;
  plotRef: RefObject<SVGSVGElement | null>;
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
const clampDock = (width: number) => Math.max(240, Math.min(440, width));
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
      left: clampDock(Number(p.left) || d.left),
      right: clampDock(Number(p.right) || d.right),
    };
  } catch {
    return d;
  }
}
function DockResizer({
  label,
  edge,
  width,
  onResize,
}: {
  label: string;
  edge: "left" | "right";
  width: number;
  onResize: (width: number) => void;
}) {
  const direction = edge === "right" ? 1 : -1;
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={240}
      aria-valuemax={440}
      aria-valuenow={width}
      tabIndex={0}
      className={`dock-resizer ${edge}`}
      onPointerDown={(e) => {
        e.preventDefault();
        const target = e.currentTarget;
        const x = e.clientX;
        target.setPointerCapture(e.pointerId);
        const move = (event: PointerEvent) =>
          onResize(clampDock(width + (event.clientX - x) * direction));
        const end = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", end);
          target.removeEventListener("pointercancel", end);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", end);
        target.addEventListener("pointercancel", end);
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation();
        onResize(
          clampDock(width + (e.key === "ArrowRight" ? 10 : -10) * direction),
        );
      }}
    />
  );
}
export function FigureWorkspace(p: Props) {
  const { analysis, history, plotRef } = p;
  const settings = history.value;
  const [prefs, setPrefs] = useState(loadPreferences);
  const [tab, setTab] = useState<"properties" | "layers">("properties");
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<EditorTool>("select");
  const [space, setSpace] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [textTarget, setTextTarget] = useState<TextTarget | null>(null);
  const [artboard, setArtboard] = useState(false);
  const [clipboardReady, setClipboardReady] = useState(false);
  const hasSelectedAnnotations = selection.some(
    (id) => id.startsWith("annotation.") && !locked(settings, id),
  );
  const stage = useRef<HTMLDivElement>(null);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const clipboard = useRef<AnnotationClipboard | null>(null);
  const selected = selection.at(-1) ?? null;
  const activeTool = space ? "hand" : tool;
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
    const medium = window.matchMedia("(min-width:1440px)");
    const large = window.matchMedia("(min-width:1024px)");
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
    const rect = el.getBoundingClientRect();
    const cx = (x ?? rect.left + rect.width / 2) - rect.left;
    const cy = (y ?? rect.top + rect.height / 2) - rect.top;
    const oldLeft = Math.max(
      24,
      (el.clientWidth - settings.widthIn * 96 * scale) / 2,
    );
    const oldTop = Math.max(
      24,
      (el.clientHeight - settings.heightIn * 96 * scale) / 2,
    );
    const px = (el.scrollLeft + cx - oldLeft) / scale;
    const py = (el.scrollTop + cy - oldTop) / scale;
    const next = Math.max(0.1, Math.min(16, scale * factor));
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
    if (
      !analysis ||
      locked(settings, id) ||
      (parent && locked(settings, parent))
    )
      return;
    if (id.startsWith("label.")) setSelection([id]);
    const parts = id.split(".");
    const style =
      id.startsWith("label.") && parts.length === 3
        ? legendEntry(
            settings,
            analysis.endpoints[parts[2] as Endpoint],
            parts[1] as "low" | "high",
          ).style
        : objectStyle(settings, id);
    const matrix = plotRef
      .current!.getScreenCTM()!
      .inverse()
      .multiply(node.getScreenCTM()!);
    const computed = getComputedStyle(node);
    setTextTarget({
      id,
      value: style.text ?? defaultText(settings, analysis, id),
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
    clipboard.current = copyAnnotations(settings, selection);
    setClipboardReady(clipboard.current.annotations.length > 0);
  }
  function paste() {
    if (!clipboard.current?.annotations.length) return;
    const pasted = pasteAnnotations(settings, clipboard.current);
    history.change(pasted.settings);
    setSelection(pasted.ids);
  }
  function remove() {
    history.change(removeAnnotations(settings, selection));
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
        if ((e.target as Element)?.closest("button")) return;
        e.preventDefault();
        setSpace(true);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (["z", "y", "c", "v", "x", "d"].includes(k)) {
          e.preventDefault();
          if (k === "z") e.shiftKey ? history.redo() : history.undo();
          if (k === "y") history.redo();
          if (k === "c") copy();
          if (k === "v") paste();
          if (k === "d") duplicate();
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
    history.change(reorderAnnotations(settings, selection, front));
  }
  return (
    <div
      className="studio"
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
          <IconButton icon="new" label="New analysis" onClick={p.onNew} />
          <IconButton icon="open" label="Open project" onClick={p.onOpen} />
          <IconButton
            icon="save"
            label="Save project"
            onClick={p.onSave}
            disabled={!analysis || p.busy}
          />
          <IconButton
            icon="undo"
            label="Undo"
            shortcut="Ctrl/⌘ Z"
            onClick={history.undo}
            disabled={!history.canUndo}
          />
          <IconButton
            icon="redo"
            label="Redo"
            shortcut="Ctrl/⌘ Shift Z"
            onClick={history.redo}
            disabled={!history.canRedo}
          />
          <IconButton
            icon="cite"
            label="Cite this analysis"
            onClick={p.onCite}
            disabled={!analysis}
          />
          <IconButton icon="help" label="How to use" onClick={p.onHelp} />
        </nav>
      </header>
      <main>
        <section className="workspace" aria-label="Survival plot workspace">
          <nav className="tools-rail" aria-label="Figure tools">
            {(
              [
                ["select", "Selection", "V"],
                ["type", "Type", "T"],
                ["hand", "Hand", "H"],
                ["zoom", "Zoom", "Z"],
                ["line", "Line", ""],
                ["arrow", "Arrow", ""],
              ] as const
            ).map(([value, label, key]) => (
              <IconButton
                icon={value}
                key={value}
                label={`${label} tool`}
                shortcut={key || undefined}
                aria-pressed={activeTool === value}
                onClick={() => setTool(value)}
              />
            ))}
            <hr />
            <IconButton
              icon="analysis"
              label="Toggle Analysis panel"
              aria-pressed={prefs.analysis}
              onClick={() => setPrefs((v) => ({ ...v, analysis: !v.analysis }))}
            />
            <IconButton
              icon="properties"
              label="Toggle Properties panel"
              aria-pressed={prefs.properties}
              onClick={() =>
                setPrefs((v) => ({ ...v, properties: !v.properties }))
              }
            />
          </nav>
          {prefs.analysis && (
            <div className="analysis-dock">
              <div className="dock-heading">
                <strong>Analysis</strong>
                <IconButton
                  icon="close"
                  label="Close Analysis panel"
                  onClick={() => setPrefs((v) => ({ ...v, analysis: false }))}
                />
              </div>
              {p.analysisControls}
              <DockResizer
                label="Resize Analysis panel"
                edge="right"
                width={prefs.left}
                onResize={(left) => setPrefs((v) => ({ ...v, left }))}
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
                {p.snapshot && <p>Saved project</p>}
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
              <IconButton
                icon="fit"
                label="Fit"
                onClick={() => setZoom(null)}
                aria-pressed={zoom === null}
              />
              <button
                type="button"
                title="Actual size (100%)"
                onClick={() => zoomAt(1 / scale)}
              >
                100%
              </button>
              <IconButton
                icon="minus"
                label="Zoom out"
                onClick={() => zoomAt(0.8)}
              />
              <span className="zoom-level">{Math.round(scale * 100)}%</span>
              <IconButton
                icon="plus"
                label="Zoom in"
                onClick={() => zoomAt(1.25)}
              />
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
                <IconButton
                  icon="close"
                  label="Close Properties panel"
                  onClick={() => setPrefs((v) => ({ ...v, properties: false }))}
                />
              </div>
              {analysis && (
                <div className="inspector-content">
                  <section
                    className="arrange-controls"
                    aria-label={`Arrange selection (${selection.length})`}
                  >
                    <div
                      className="button-row"
                      role="group"
                      aria-label="Align and distribute"
                    >
                      <IconButton
                        icon="artboard"
                        label="Align to artboard"
                        description={
                          artboard
                            ? "Using the page edges. Click to align within the selection."
                            : "Using the selection bounds. Click to align to the page edges."
                        }
                        aria-pressed={artboard}
                        onClick={() => setArtboard((value) => !value)}
                      />
                      {(
                        [
                          ["left", "align-left", "Align left"],
                          [
                            "center",
                            "align-center",
                            "Align horizontal centers",
                          ],
                          ["right", "align-right", "Align right"],
                          ["top", "align-top", "Align top"],
                          ["middle", "align-middle", "Align vertical centers"],
                          ["bottom", "align-bottom", "Align bottom"],
                          [
                            "distribute-x",
                            "distribute-x",
                            "Distribute horizontally",
                          ],
                          [
                            "distribute-y",
                            "distribute-y",
                            "Distribute vertically",
                          ],
                        ] as const
                      ).map(([action, icon, label]) => (
                        <IconButton
                          icon={icon}
                          label={label}
                          key={action}
                          disabled={
                            !selection.length ||
                            (action.startsWith("distribute") &&
                              selection.length < 3)
                          }
                          description={
                            action.startsWith("distribute")
                              ? "Select at least three objects to space them evenly."
                              : undefined
                          }
                          onClick={() => align(action)}
                        />
                      ))}
                    </div>
                    <div
                      className="button-row"
                      role="group"
                      aria-label="Object actions"
                    >
                      <IconButton
                        icon="copy"
                        label="Copy"
                        description="Copy selected annotations."
                        shortcut="Ctrl/⌘ C"
                        disabled={!hasSelectedAnnotations}
                        onClick={copy}
                      />
                      <IconButton
                        icon="paste"
                        label="Paste"
                        description="Paste copied annotations into this figure."
                        shortcut="Ctrl/⌘ V"
                        disabled={
                          !clipboardReady || settings.annotations.length >= 100
                        }
                        onClick={paste}
                      />
                      <IconButton
                        icon="duplicate"
                        label="Duplicate"
                        description="Duplicate selected annotations."
                        shortcut="Ctrl/⌘ D"
                        disabled={
                          !hasSelectedAnnotations ||
                          settings.annotations.length >= 100
                        }
                        onClick={duplicate}
                      />
                      <IconButton
                        icon="front"
                        label="Bring to front"
                        description="Bring selected annotations above other annotations."
                        disabled={!hasSelectedAnnotations}
                        onClick={() => reorder(true)}
                      />
                      <IconButton
                        icon="back"
                        label="Send to back"
                        description="Send selected annotations below other annotations."
                        disabled={!hasSelectedAnnotations}
                        onClick={() => reorder(false)}
                      />
                      <IconButton
                        icon="delete"
                        label="Delete annotations"
                        shortcut="Delete"
                        disabled={!hasSelectedAnnotations}
                        onClick={remove}
                      />
                      <span
                        className="selection-count"
                        title={`${selection.length} selected`}
                      >
                        {selection.length}
                      </span>
                    </div>
                  </section>
                  {tab === "properties" ? (
                    <FigureEditor
                      settings={settings}
                      analysis={analysis}
                      selected={selected}
                      select={(id) => setSelection(id ? [id] : [])}
                      history={history}
                      savePreset={p.onPreset}
                      openFile={p.onOpen}
                    />
                  ) : (
                    <LayersPanel
                      settings={settings}
                      analysis={analysis}
                      selection={selection}
                      select={setSelection}
                      change={history.change}
                    />
                  )}
                  <IconButton
                    icon="reset"
                    label="Reset figure"
                    showLabel
                    className="reset-figure"
                    onClick={() => {
                      history.change(defaultFigure());
                      setSelection([]);
                    }}
                  />
                </div>
              )}
              <DockResizer
                label="Resize Properties panel"
                edge="left"
                width={prefs.right}
                onResize={(right) => setPrefs((v) => ({ ...v, right }))}
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
