import { useEffect, useRef, useState } from "react";
import type { SurvivalAnalysis } from "./types";
import {
  bibliography,
  citationText,
  methodsText,
  resolveProvenance,
} from "./citations";
import { download } from "./export";
export function CitationDialog({
  open,
  close,
  analysis,
}: {
  open: boolean;
  close: () => void;
  analysis: SurvivalAnalysis | null;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [status, setStatus] = useState("");
  useEffect(() => {
    if (open) {
      setStatus("");
      ref.current?.showModal();
    } else ref.current?.close();
  }, [open]);
  const provenance = analysis
    ? (analysis.provenance ?? resolveProvenance(analysis))
    : null;
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard.");
    } catch {
      setStatus(
        "Clipboard access is unavailable. Select and copy the text below, or download the references.",
      );
    }
  }
  return (
    <dialog
      ref={ref}
      className="help-dialog citation-dialog"
      onCancel={close}
      aria-labelledby="citation-title"
    >
      <button
        type="button"
        className="dialog-close"
        onClick={close}
        aria-label="Close citations"
      >
        ×
      </button>
      <h2 id="citation-title">Cite this analysis</h2>
      {analysis && provenance ? (
        <>
          <p>
            <strong>
              {analysis.gene} · {analysis.cohort}
            </strong>
            <br />
            SurvScope data {analysis.dataVersion} · GDC release:{" "}
            {provenance.upstreamRelease ?? "not recorded"}
          </p>
          <p>{provenance.cohortPublicationNote}</p>
          <div className="citation-actions">
            <button
              type="button"
              onClick={() => void copy(bibliography(analysis, "text"))}
            >
              Copy references
            </button>
            {(["bibtex", "ris"] as const).map((kind) => (
              <button
                type="button"
                key={kind}
                onClick={() =>
                  download(
                    new Blob([bibliography(analysis, kind)], {
                      type: "text/plain;charset=utf-8",
                    }),
                    `${analysis.gene}_${analysis.cohort}_references.${kind === "bibtex" ? "bib" : "ris"}`,
                  )
                }
              >
                {kind === "bibtex" ? "Download BibTeX" : "Download RIS"}
              </button>
            ))}
          </div>
          <ol className="citation-list">
            {provenance.citations.map((c) => (
              <li key={c.id}>
                <span className="citation-role">{c.role}</span>
                {citationText(c).replace(/ https:\/\/\S+$/, "")}{" "}
                <a
                  href={c.doi ? `https://doi.org/${c.doi}` : c.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.doi ? `doi:${c.doi}` : "Source record"}
                </a>
              </li>
            ))}
          </ol>
          <h3>Methods and acknowledgement</h3>
          <p>
            This text describes the calculated analysis, including group sizes
            and exclusions.
          </p>
          <textarea
            className="citation-methods"
            aria-label="Methods and acknowledgement"
            readOnly
            value={methodsText(analysis)}
          />
          <button
            type="button"
            onClick={() => void copy(methodsText(analysis))}
          >
            Copy methods and acknowledgement
          </button>
          {status && <p role="status">{status}</p>}
        </>
      ) : (
        <p>Create a survival plot to see the references for its data.</p>
      )}
    </dialog>
  );
}
