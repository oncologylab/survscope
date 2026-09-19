import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { DATA_VERSION, loadGeneData, loadManifest } from "./data";
import { cohortDisplayName, figureFilename } from "./cohorts";
import { download, saveJson, savePdf, savePng, saveSvg } from "./export";
import { SurvivalPlot } from "./SurvivalPlot";
import { analyzeGeneData, prepareEndpoint } from "./statistics";
import { ENDPOINTS } from "./types";
import type {
  Endpoint,
  GeneData,
  GroupingSpec,
  Manifest,
  SurvivalAnalysis,
} from "./types";
import {
  comparisonDraft,
  ComparisonControls,
  draftGrouping,
} from "./ComparisonControls";
import { groupingFromQuery, groupingQuery } from "./grouping";
import { defaultFigure, reusableStyle } from "./figure";
import { FigureEditor } from "./FigureEditor";
import { useHistory } from "./useHistory";
import {
  presetFile,
  projectFile,
  readFigureFile,
  validateSettings,
} from "./project";
import { HelpGuide } from "./HelpGuide";

function queryDefaults() {
  const params = new URLSearchParams(window.location.search);
  let grouping: GroupingSpec = { kind: "median" },
    error = "";
  try {
    grouping = groupingFromQuery(params);
  } catch (e) {
    error = (e as Error).message;
  }
  return {
    gene: params.get("gene") ?? "SRD5A1",
    cohort: params.get("cohort")?.toUpperCase() ?? "PAAD",
    grouping,
    error,
  };
}
const outcomeNames = {
  OS: "Overall survival",
  DSS: "Disease-specific survival",
  PFI: "Progression-free interval",
  DFI: "Disease-free interval",
};

export default function App() {
  const [defaults] = useState(queryDefaults);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [gene, setGene] = useState(defaults.gene),
    [cohort, setCohort] = useState(defaults.cohort);
  const [draft, setDraft] = useState(() => comparisonDraft(defaults.grouping));
  const [loaded, setLoaded] = useState<GeneData | null>(null);
  const [analysis, setAnalysis] = useState<SurvivalAnalysis | null>(null);
  const [status, setStatus] = useState(
    defaults.error || "Loading the data catalog…",
  );
  const [busy, setBusy] = useState(false),
    [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [editing, setEditing] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const [help, setHelp] = useState(false),
    [snapshot, setSnapshot] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null),
    [pan, setPan] = useState(false);
  const history = useHistory(defaultFigure()),
    settings = history.value;
  const plotRef = useRef<SVGSVGElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    stageRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(!!defaults.error),
    pendingLoad = useRef(0);
  const panStart = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const comparison = useMemo(() => {
    try {
      return { spec: draftGrouping(draft), error: "" };
    } catch (e) {
      return { spec: null, error: (e as Error).message };
    }
  }, [draft]);

  useEffect(() => {
    let active = true;
    loadManifest()
      .then((value) => {
        if (!active) return;
        if (
          !new URLSearchParams(window.location.search).has("cohort") &&
          !value.cohorts.PAAD
        )
          setCohort(Object.keys(value.cohorts)[0] ?? "PAAD");
        setManifest(value);
      })
      .catch((error) => active && setStatus(error.message));
    return () => {
      active = false;
    };
  }, []);
  const suggestions = useMemo(() => {
    if (!manifest || !gene.trim()) return [];
    const query = gene.trim().toUpperCase();
    return manifest.genes
      .filter(
        (item) =>
          item.cohorts.includes(cohort) &&
          (item.symbol.toUpperCase().includes(query) ||
            item.ensembl.toUpperCase().includes(query)),
      )
      .slice(0, 8);
  }, [manifest, gene, cohort]);

  // Prefetch only a catalogued selection, so group counts are visible before running a comparison.
  useEffect(() => {
    if (!manifest) return;
    const loadId = ++pendingLoad.current;
    setLoaded(null);
    const match = manifest.genes.find(
      (item) =>
        item.cohorts.includes(cohort) &&
        [item.symbol.toUpperCase(), item.ensembl.toUpperCase()].includes(
          gene.trim().toUpperCase(),
        ),
    );
    if (!match) {
      if (!initialized.current)
        setStatus("Choose a supported gene and cohort.");
      return;
    }
    const timer = window.setTimeout(() => {
      loadGeneData(match.symbol, cohort)
        .then((data) => {
          if (loadId !== pendingLoad.current) return;
          setLoaded(data);
          if (!initialized.current) {
            initialized.current = true;
            setAnalysis(analyzeGeneData(data, defaults.grouping));
            setStatus("");
          } else if (!defaults.error) setStatus("");
        })
        .catch((error) => {
          if (loadId === pendingLoad.current) setStatus(error.message);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      pendingLoad.current++;
    };
  }, [manifest, gene, cohort]);

  const previews = useMemo(
    () =>
      !loaded || !comparison.spec
        ? []
        : ENDPOINTS.map((ep) => {
            const data = prepareEndpoint(loaded, ep, comparison.spec!);
            return {
              ep,
              n: data.time.length,
              high: data.high.filter(Boolean).length,
              excluded: data.excludedMiddle,
            };
          }),
    [loaded, comparison],
  );

  const changesPending =
    !!analysis &&
    !snapshot &&
    (gene.trim().toUpperCase() !== analysis.gene.toUpperCase() ||
      cohort !== analysis.cohort ||
      !comparison.spec ||
      JSON.stringify(comparison.spec) !== JSON.stringify(analysis.grouping));

  async function runAnalysis(event?: FormEvent) {
    event?.preventDefault();
    if (!comparison.spec) {
      setStatus(comparison.error);
      return;
    }
    if (snapshot && analysis?.dataVersion !== DATA_VERSION) {
      setStatus(
        `This saved figure uses data ${analysis?.dataVersion}. Choose New analysis to calculate with the current data release.`,
      );
      return;
    }
    setBusy(true);
    setStatus("Preparing your comparison…");
    setSuggestionsOpen(false);
    const loadId = ++pendingLoad.current;
    try {
      const data = loaded ?? (await loadGeneData(gene, cohort));
      if (loadId !== pendingLoad.current) return;
      const result = analyzeGeneData(data, comparison.spec);
      initialized.current = true;
      setGene(result.gene);
      setLoaded(data);
      setAnalysis(result);
      setSnapshot(false);
      history.replace(reusableStyle(settings));
      setSelected(null);
      setStatus("");
      window.history.replaceState(
        null,
        "",
        `?${new URLSearchParams({ gene: result.gene, cohort: result.cohort, ...groupingQuery(result.grouping) })}`,
      );
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function newAnalysis() {
    initialized.current = true;
    setSnapshot(false);
    setAnalysis(null);
    setEditing(false);
    setSelected(null);
    history.replace(reusableStyle(settings));
    setStatus("Choose your gene, cohort, and comparison, then create a plot.");
  }
  async function exportPlot(
    kind: "svg" | "pdf" | "png" | "json" | "project" | "preset",
  ) {
    if (!analysis || !plotRef.current) return;
    const svg = plotRef.current.cloneNode(true) as SVGSVGElement,
      captured = structuredClone(settings);
    setBusy(true);
    setStatus(
      `Preparing ${kind === "project" || kind === "preset" ? kind : kind.toUpperCase()}…`,
    );
    try {
      if (kind === "svg") await saveSvg(svg, analysis, captured);
      if (kind === "pdf") await savePdf(svg, analysis, captured);
      if (kind === "png") await savePng(svg, analysis, captured.dpi, captured);
      if (kind === "json") saveJson(analysis);
      if (kind === "project" || kind === "preset") {
        validateSettings(captured);
        const file =
          kind === "project"
            ? projectFile(analysis, captured)
            : presetFile(captured);
        const name =
          kind === "project"
            ? figureFilename(analysis.gene, analysis.cohort, "survscope.json")
            : "survscope-style.json";
        download(
          new Blob([JSON.stringify(file, null, 2) + "\n"], {
            type: "application/json",
          }),
          name,
        );
      }
      setStatus("");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("The maximum project size is 10 MiB.");
      const parsed = readFigureFile(await file.text());
      if (parsed.format === "survscope-project") {
        initialized.current = true;
        ++pendingLoad.current;
        setAnalysis(parsed.analysis);
        setGene(parsed.analysis.gene);
        setCohort(parsed.analysis.cohort);
        setDraft(comparisonDraft(parsed.analysis.grouping));
        setSnapshot(true);
        history.replace(parsed.settings);
        setStatus(
          `Opened saved figure using data ${parsed.analysis.dataVersion}.`,
        );
      } else {
        history.change(parsed.settings);
        setStatus("Style preset applied.");
      }
      setSelected(null);
      setEditing(parsed.format === "survscope-project" || !!analysis);
      setZoom(null);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest("dialog")) return;
      if (
        !editing ||
        /^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement).tagName)
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        history.redo();
        return;
      }
      if (event.key === "Escape") {
        setSelected(null);
        return;
      }
      if (!selected) return;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (!delta[event.key] || selected.startsWith("curve.")) return;
      event.preventDefault();
      const [x, y] = delta[event.key].map((n) => n * (event.shiftKey ? 10 : 1)),
        next = structuredClone(settings);
      if (selected.startsWith("panel.")) {
        const box = next.panels[selected.split(".")[1] as Endpoint];
        box.x = Math.max(
          0,
          Math.min(1 - box.width, box.x + x / (settings.widthIn * 72)),
        );
        box.y = Math.max(
          0,
          Math.min(1 - box.height, box.y + y / (settings.heightIn * 72)),
        );
      } else if (selected.startsWith("annotation.")) {
        const item = next.annotations.find(
          (a) => `annotation.${a.id}` === selected,
        );
        if (!item) return;
        item.x += x / (settings.widthIn * 72);
        item.x2 += x / (settings.widthIn * 72);
        item.y += y / (settings.heightIn * 72);
        item.y2 += y / (settings.heightIn * 72);
      } else {
        const style = (next.elements[selected] ??= {});
        style.dx = (style.dx ?? 0) + x;
        style.dy = (style.dy ?? 0) + y;
      }
      history.change(next);
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [editing, selected, settings, history]);

  function beginPan(event: ReactPointerEvent) {
    if (!editing || !pan || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    panStart.current = {
      x: event.clientX,
      y: event.clientY,
      left: stageRef.current.scrollLeft,
      top: stageRef.current.scrollTop,
    };
    stageRef.current.setPointerCapture(event.pointerId);
  }
  return (
    <div className={`app-shell ${editing ? "is-editing" : ""}`}>
      <header className="masthead">
        <a className="brand" href={import.meta.env.BASE_URL}>
          SurvScope
        </a>
        <div className="header-actions">
          <button type="button" onClick={() => setHelp(true)}>
            How to use
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Open project
          </button>
          <span className="data-version">
            Data {analysis?.dataVersion ?? manifest?.data_version ?? "…"}
          </span>
        </div>
      </header>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="file-input"
        aria-label="Open figure file"
        onChange={(event) => {
          void openFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <main>
        <section className="workspace" aria-label="Survival plot workspace">
          {editing && analysis ? (
            <FigureEditor
              settings={settings}
              analysis={analysis}
              selected={selected}
              select={setSelected}
              change={history.change}
              savePreset={() => void exportPlot("preset")}
              openFile={() => fileRef.current?.click()}
            />
          ) : (
            <form className="controls" onSubmit={runAnalysis}>
              <div className="control-heading">
                <span>01</span>
                <div>
                  <h2>Choose an analysis</h2>
                  <p>Explore a gene in a cancer cohort.</p>
                </div>
              </div>
              <label>
                <span>Cancer cohort</span>
                <select
                  aria-label="Cancer cohort"
                  value={cohort}
                  onChange={(e) => setCohort(e.target.value)}
                  disabled={!manifest || busy}
                >
                  {manifest &&
                    ["TCGA", "CPTAC"].map((program) => (
                      <optgroup label={program} key={program}>
                        {Object.entries(manifest.cohorts)
                          .filter(
                            ([, details]) =>
                              (details.program ?? "TCGA") === program,
                          )
                          .map(([code, details]) => (
                            <option value={code} key={code}>
                              {cohortDisplayName(code)} — {details.label} (n=
                              {details.sample_count})
                            </option>
                          ))}
                      </optgroup>
                    ))}
                </select>
              </label>
              <label className="gene-control">
                <span>Gene symbol or Ensembl ID</span>
                <input
                  aria-label="Gene symbol or Ensembl ID"
                  value={gene}
                  onChange={(e) => {
                    setGene(e.target.value);
                    setSuggestionsOpen(true);
                  }}
                  onFocus={() => setSuggestionsOpen(true)}
                  onBlur={() =>
                    window.setTimeout(() => setSuggestionsOpen(false), 150)
                  }
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!manifest || busy}
                />
                {suggestionsOpen && suggestions.length > 0 && (
                  <div className="suggestions">
                    {suggestions.map((item) => (
                      <button
                        type="button"
                        key={item.ensembl}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setGene(item.symbol);
                          setSuggestionsOpen(false);
                        }}
                      >
                        <strong>{item.symbol}</strong>
                        <small>{item.ensembl}</small>
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <ComparisonControls
                draft={draft}
                change={setDraft}
                disabled={!manifest || busy}
              />
              {comparison.error && (
                <p className="field-error" role="alert">
                  {comparison.error}
                </p>
              )}
              {previews.length > 0 && (
                <div
                  className="group-preview"
                  aria-label="Group sizes before analysis"
                >
                  <div>
                    <strong>Patients in this comparison</strong>
                    <span>Lower / Higher</span>
                  </div>
                  {previews.map((p) => (
                    <p key={p.ep}>
                      <span title={outcomeNames[p.ep]}>{p.ep}</span>
                      <span>
                        {p.n ? `${p.n - p.high} / ${p.high}` : "Unavailable"}
                      </span>
                      {p.excluded > 0 && (
                        <small>{p.excluded} middle excluded</small>
                      )}
                    </p>
                  ))}
                </div>
              )}
              <button
                className="primary-button"
                type="submit"
                disabled={busy || !manifest || !comparison.spec}
              >
                {busy ? "Working…" : "Create survival plot"}
              </button>
              <p className="help-text">
                Each outcome uses patients with available follow-up.{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setHelp(true)}
                >
                  Learn how to read the figure
                </button>
              </p>
            </form>
          )}
          <section className="result">
            <div className="result-heading">
              <div>
                <span>02</span>
                <div>
                  <h2>{editing ? "Figure editor" : "Publication figure"}</h2>
                  <p>
                    {snapshot
                      ? "Saved project"
                      : "Kaplan–Meier survival comparison"}
                  </p>
                </div>
              </div>
              <div className="export-buttons">
                {(["svg", "pdf", "png", "json"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    disabled={!analysis || busy}
                    onClick={() => void exportPlot(kind)}
                  >
                    {kind.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="figure-toolbar">
              <button
                className="edit-button"
                type="button"
                disabled={!analysis}
                onClick={() => {
                  setEditing(!editing);
                  setSelected(null);
                  setZoom(null);
                }}
              >
                {editing ? "Done editing" : "Edit figure"}
              </button>
              <button
                type="button"
                disabled={!analysis || busy}
                onClick={() => void exportPlot("project")}
              >
                Save project
              </button>
              <button type="button" onClick={newAnalysis}>
                New analysis
              </button>
              {editing && (
                <>
                  <button
                    type="button"
                    disabled={!history.canUndo}
                    onClick={history.undo}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    disabled={!history.canRedo}
                    onClick={history.redo}
                  >
                    Redo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      history.change(defaultFigure());
                      setSelected(null);
                    }}
                  >
                    Reset figure
                  </button>
                </>
              )}
            </div>
            {changesPending && !editing && (
              <p className="pending-status">
                Selections changed. Create a survival plot to update this
                figure.
              </p>
            )}
            {status && (
              <p className="global-status" role="status">
                {status}
              </p>
            )}
            {analysis && !editing && (
              <section className="quality-strip" aria-label="Endpoint quality">
                {ENDPOINTS.map((ep) => {
                  const result = analysis.endpoints[ep];
                  return (
                    <article key={ep} data-quality={result.quality}>
                      <div>
                        <strong title={outcomeNames[ep]}>{ep}</strong>
                        <span>{result.quality.replaceAll("_", " ")}</span>
                      </div>
                      <p>
                        n={result.n} · events={result.events} ·{" "}
                        {result.lowerThreshold !== result.upperThreshold &&
                        Number.isFinite(result.lowerThreshold)
                          ? `≤${result.lowerThreshold.toPrecision(4)} / >${result.upperThreshold.toPrecision(4)} TPM · ${result.excludedMiddle} middle excluded`
                          : `cutoff ${Number.isFinite(result.cutoffTpm) ? result.cutoffTpm.toPrecision(5) : "NA"} TPM`}
                      </p>
                      {(result.warning || result.qualityNote) && (
                        <small>
                          {result.quality === "unavailable"
                            ? result.qualityNote
                            : result.warning || result.qualityNote}
                        </small>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
            {editing && (
              <div className="zoom-toolbar">
                <span>View</span>
                <button type="button" onClick={() => setZoom(null)}>
                  Fit
                </button>
                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={() => setZoom(Math.max(0.25, (zoom ?? 0.75) - 0.25))}
                >
                  −
                </button>
                <span>
                  {zoom === null ? "Fit" : `${Math.round(zoom * 100)}%`}
                </span>
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={() => setZoom(Math.min(3, (zoom ?? 0.75) + 0.25))}
                >
                  +
                </button>
                <button
                  type="button"
                  aria-pressed={pan}
                  onClick={() => setPan(!pan)}
                >
                  {pan ? "Pan tool on" : "Pan tool"}
                </button>
                <small>
                  Arrow keys move selected items; Shift moves farther.
                </small>
              </div>
            )}
            <div
              ref={stageRef}
              className={`plot-stage ${zoom !== null ? "zoomed" : "fitted"} ${pan && editing ? "panning" : ""}`}
              onPointerDownCapture={beginPan}
              onPointerMove={(event) => {
                if (!panStart.current || !stageRef.current) return;
                stageRef.current.scrollLeft =
                  panStart.current.left + panStart.current.x - event.clientX;
                stageRef.current.scrollTop =
                  panStart.current.top + panStart.current.y - event.clientY;
              }}
              onPointerUp={(event) => {
                if (panStart.current) {
                  panStart.current = null;
                  stageRef.current?.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={() => {
                panStart.current = null;
              }}
            >
              {analysis ? (
                <div
                  className="figure-canvas"
                  style={
                    zoom !== null
                      ? {
                          width: settings.widthIn * 96 * zoom,
                          height: settings.heightIn * 96 * zoom,
                        }
                      : {
                          aspectRatio: `${settings.widthIn}/${settings.heightIn}`,
                        }
                  }
                >
                  <SurvivalPlot
                    ref={plotRef}
                    analysis={analysis}
                    settings={settings}
                    editor={
                      editing
                        ? {
                            selected,
                            select: setSelected,
                            begin: history.begin,
                            preview: history.preview,
                            commit: history.commit,
                            change: history.change,
                          }
                        : undefined
                    }
                  />
                </div>
              ) : (
                <div className="plot-placeholder">
                  <span>KM</span>
                  <p>Select a supported gene and cohort.</p>
                </div>
              )}
            </div>
          </section>
        </section>
      </main>
      <footer>
        <p>
          SurvScope is research software, not a diagnostic or clinical
          decision-making tool.
        </p>
        <a href="https://github.com/oncologylab/survscope">Source on GitHub</a>
      </footer>
      <HelpGuide open={help} close={() => setHelp(false)} />
    </div>
  );
}
