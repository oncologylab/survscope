import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { loadGeneData, loadManifest } from "./data";
import { saveJson, savePdf, savePng, saveSvg } from "./export";
import { SurvivalPlot } from "./SurvivalPlot";
import { analyzeGeneData } from "./statistics";
import { ENDPOINTS } from "./types";
import type { GeneRecord, Manifest, SurvivalAnalysis } from "./types";

function queryDefaults() {
  const params = new URLSearchParams(window.location.search);
  return {
    gene: params.get("gene") ?? "SRD5A1",
    cohort: params.get("cohort")?.toUpperCase() ?? "PAAD",
    cutoff: params.get("cutoff") ?? "median",
  };
}

function qualityLabel(value: string): string {
  return value.replace("_", " ");
}

export default function App() {
  const defaults = queryDefaults();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [gene, setGene] = useState(defaults.gene);
  const [cohort, setCohort] = useState(defaults.cohort);
  const [cutoffMode, setCutoffMode] = useState<"median" | "custom">(
    defaults.cutoff === "median" ? "median" : "custom",
  );
  const [customCutoff, setCustomCutoff] = useState(
    defaults.cutoff === "median" ? "1" : defaults.cutoff,
  );
  const [analysis, setAnalysis] = useState<SurvivalAnalysis | null>(null);
  const [status, setStatus] = useState("Loading the data catalog…");
  const [busy, setBusy] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const plotRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    loadManifest()
      .then((value) => {
        setManifest(value);
        setStatus("");
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  const suggestions = useMemo(() => {
    if (!manifest || gene.trim().length < 1) return [];
    const query = gene.toUpperCase();
    return manifest.genes
      .filter(
        (item) =>
          item.cohorts.includes(cohort) &&
          (item.symbol.toUpperCase().includes(query) ||
            item.ensembl.toUpperCase().includes(query)),
      )
      .slice(0, 8);
  }, [manifest, gene, cohort]);

  async function runAnalysis(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setStatus(`Loading ${gene.toUpperCase()} in TCGA-${cohort}…`);
    try {
      const cutoff =
        cutoffMode === "median" ? "median" : Number.parseFloat(customCutoff);
      if (cutoff !== "median" && (!Number.isFinite(cutoff) || cutoff < 0)) {
        throw new Error("Custom TPM cutoff must be a non-negative number.");
      }
      const data = await loadGeneData(gene, cohort);
      const result = analyzeGeneData(data, cutoff);
      setGene(result.gene);
      setAnalysis(result);
      setStatus("");
      const params = new URLSearchParams({
        gene: result.gene,
        cohort,
        cutoff: String(cutoff),
      });
      window.history.replaceState(null, "", `?${params}`);
    } catch (error) {
      setAnalysis(null);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (manifest && !analysis) void runAnalysis();
    // Initial plot should run exactly once after the manifest arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  async function exportPlot(kind: "svg" | "pdf" | "png" | "json") {
    if (!analysis || !plotRef.current) return;
    setBusy(true);
    setStatus(`Preparing ${kind.toUpperCase()}…`);
    try {
      if (kind === "svg") saveSvg(plotRef.current, analysis);
      if (kind === "pdf") await savePdf(plotRef.current, analysis);
      if (kind === "png") await savePng(plotRef.current, analysis, 300);
      if (kind === "json") saveJson(analysis);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>
            <strong>SurvScope</strong>
            <small>TCGA survival, publication ready</small>
          </span>
        </a>
        <div className="data-badge">
          <span>Data release</span>
          <strong>{manifest?.data_version ?? "…"}</strong>
        </div>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">OncologyLab research software</p>
          <h1>From gene to survival figure, without a server.</h1>
          <p>
            Explore primary-cancer STAR TPM across TCGA cohorts. Every
            calculation runs locally in your browser from versioned static data.
          </p>
        </section>

        <section className="workspace" aria-label="Survival plot workspace">
          <form className="controls" onSubmit={runAnalysis}>
            <div className="control-heading">
              <span>01</span>
              <div>
                <h2>Choose an analysis</h2>
                <p>Median reproduces the reference plot grouping exactly.</p>
              </div>
            </div>

            <label>
              <span>TCGA cohort</span>
              <select
                value={cohort}
                onChange={(event) => {
                  setCohort(event.target.value);
                  setAnalysis(null);
                }}
                disabled={!manifest || busy}
              >
                {manifest &&
                  Object.entries(manifest.cohorts).map(([code, details]) => (
                    <option value={code} key={code}>
                      {code} — {details.label}
                    </option>
                  ))}
              </select>
            </label>

            <label className="gene-control">
              <span>Gene symbol or Ensembl ID</span>
              <input
                value={gene}
                onChange={(event) => {
                  setGene(event.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                autoComplete="off"
                spellCheck={false}
                disabled={!manifest || busy}
              />
              {suggestionsOpen && suggestions.length > 0 && (
                <div className="suggestions">
                  {suggestions.map((item: GeneRecord) => (
                    <button
                      type="button"
                      key={`${item.symbol}-${item.ensembl}`}
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

            <fieldset>
              <legend>Expression cutoff</legend>
              <label className="radio">
                <input
                  type="radio"
                  name="cutoff"
                  checked={cutoffMode === "median"}
                  onChange={() => setCutoffMode("median")}
                />
                <span>
                  <strong>Endpoint median</strong>
                  <small>Exact reference grouping</small>
                </span>
              </label>
              <label className="radio">
                <input
                  type="radio"
                  name="cutoff"
                  checked={cutoffMode === "custom"}
                  onChange={() => setCutoffMode("custom")}
                />
                <span>
                  <strong>Custom TPM</strong>
                  <small>0.001 log2(TPM+1) resolution</small>
                </span>
              </label>
              {cutoffMode === "custom" && (
                <input
                  className="cutoff-input"
                  type="number"
                  min="0"
                  step="any"
                  value={customCutoff}
                  onChange={(event) => setCustomCutoff(event.target.value)}
                  aria-label="Custom TPM cutoff"
                />
              )}
            </fieldset>

            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Working…" : "Create survival plot"}
            </button>
            <p className={`status ${status ? "visible" : ""}`} role="status">
              {status || "\u00a0"}
            </p>
          </form>

          <section className="result">
            <div className="result-heading">
              <div>
                <span>02</span>
                <div>
                  <h2>Publication figure</h2>
                  <p>
                    Vector-first output · log-rank · Cox HR · BH correction
                  </p>
                </div>
              </div>
              <div className="export-buttons">
                {(["svg", "pdf", "png", "json"] as const).map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    disabled={!analysis || busy}
                    onClick={() => void exportPlot(kind)}
                  >
                    {kind.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="plot-stage">
              {analysis ? (
                <SurvivalPlot ref={plotRef} analysis={analysis} />
              ) : (
                <div className="plot-placeholder">
                  <span>KM</span>
                  <p>Select a supported gene and cohort.</p>
                </div>
              )}
            </div>
          </section>
        </section>

        {analysis && (
          <section className="endpoint-quality">
            <div className="section-title">
              <span>03</span>
              <div>
                <h2>Endpoint quality</h2>
                <p>TCGA-CDR Table 3 recommendations remain visible.</p>
              </div>
            </div>
            <div className="quality-grid">
              {ENDPOINTS.map((endpoint) => {
                const result = analysis.endpoints[endpoint];
                return (
                  <article key={endpoint} data-quality={result.quality}>
                    <div>
                      <strong>{endpoint}</strong>
                      <span>{qualityLabel(result.quality)}</span>
                    </div>
                    <p>
                      n={result.n}; events={result.events}; cutoff=
                      {Number.isFinite(result.cutoffTpm)
                        ? `${result.cutoffTpm.toPrecision(5)} TPM`
                        : "NA"}
                    </p>
                    {(result.qualityNote || result.warning) && (
                      <small>{result.warning || result.qualityNote}</small>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="provenance">
          <h2>Transparent by design</h2>
          <div>
            <p>
              <strong>Expression</strong>
              GDC STAR TPM, cohort-specific primary samples
            </p>
            <p>
              <strong>Outcomes</strong>
              PanCanAtlas TCGA-CDR OS, DSS, PFI, DFI
            </p>
            <p>
              <strong>Runtime</strong>
              Pure static browser application; no biomedical API calls
            </p>
          </div>
        </section>
      </main>

      <footer>
        <p>
          SurvScope is research software, not a diagnostic or clinical
          decision-making tool.
        </p>
        <a href="https://github.com/oncologylab/survscope">Source on GitHub</a>
      </footer>
    </div>
  );
}
