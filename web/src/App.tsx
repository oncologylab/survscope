import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { DATA_VERSION, loadGeneData, loadManifest } from "./data";
import { cohortDisplayName, figureFilename } from "./cohorts";
import { download, saveJson, savePdf, savePng, saveSvg } from "./export";
import { FigureWorkspace } from "./FigureWorkspace";
import { CitationDialog } from "./CitationDialog";
import { attachProvenance } from "./citations";
import { analyzeGeneData, prepareEndpoint } from "./statistics";
import { ENDPOINTS } from "./types";
import type {
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
  const [help, setHelp] = useState(false),
    [cite, setCite] = useState(false),
    [snapshot, setSnapshot] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const history = useHistory(defaultFigure()),
    settings = history.value;
  const plotRef = useRef<SVGSVGElement>(null),
    fileRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const initialized = useRef(!!defaults.error),
    pendingLoad = useRef(0);
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
            setAnalysis(
              attachProvenance(
                analyzeGeneData(data, defaults.grouping),
                manifest,
              ),
            );
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
      const result = attachProvenance(
        analyzeGeneData(data, comparison.spec),
        manifest,
      );
      initialized.current = true;
      setGene(result.gene);
      setLoaded(data);
      setAnalysis(result);
      setSnapshot(false);
      history.replace(reusableStyle(settings));
      setResetKey((key) => key + 1);
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
    setResetKey((key) => key + 1);
    history.replace(reusableStyle(settings));
    setStatus("Choose your gene, cohort, and comparison, then create a plot.");
  }
  async function exportPlot(
    kind: "svg" | "pdf" | "png" | "json" | "project" | "preset",
  ) {
    window.dispatchEvent(new Event("survscope:commit-text"));
    if (!analysis || !plotRef.current) return;
    const svg = plotRef.current.cloneNode(true) as SVGSVGElement,
      captured = structuredClone(settingsRef.current);
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
      setResetKey((key) => key + 1);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <>
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
      <FigureWorkspace
        analysis={analysis}
        history={history}
        plotRef={plotRef}
        resetKey={resetKey}
        busy={busy}
        status={status}
        pending={changesPending}
        snapshot={snapshot}
        onOpen={() => fileRef.current?.click()}
        onNew={newAnalysis}
        onSave={() => void exportPlot("project")}
        onPreset={() => void exportPlot("preset")}
        onHelp={() => setHelp(true)}
        onCite={() => setCite(true)}
        onExport={(kind) => void exportPlot(kind)}
        analysisControls={
          <form className="controls" onSubmit={runAnalysis}>
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
            {analysis && (
              <details className="analysis-quality" open>
                <summary>Outcomes in the displayed figure</summary>
                <section
                  className="quality-strip"
                  aria-label="Endpoint quality"
                >
                  {ENDPOINTS.map((ep) => {
                    const result = analysis.endpoints[ep];
                    return (
                      <article key={ep} data-quality={result.quality}>
                        <div>
                          <strong title={outcomeNames[ep]}>{ep}</strong>
                          <span>{result.quality.replaceAll("_", " ")}</span>
                        </div>
                        <p>
                          n={result.n} · events={result.events}
                        </p>
                        <p>
                          {Number.isFinite(result.lowerThreshold)
                            ? result.lowerThreshold !== result.upperThreshold
                              ? `≤${result.lowerThreshold.toPrecision(4)} / >${result.upperThreshold.toPrecision(4)} TPM · ${result.excludedMiddle} middle excluded`
                              : `cutoff ${result.cutoffTpm.toPrecision(5)} TPM`
                            : "Unavailable"}
                        </p>
                        <small>{result.warning || result.qualityNote}</small>
                      </article>
                    );
                  })}
                </section>
              </details>
            )}
          </form>
        }
      />
      <HelpGuide
        open={help}
        close={() => setHelp(false)}
        cite={() => {
          setHelp(false);
          setCite(true);
        }}
      />
      <CitationDialog
        open={cite}
        close={() => setCite(false)}
        analysis={analysis}
        showQ={settings.showQ}
      />
    </>
  );
}
