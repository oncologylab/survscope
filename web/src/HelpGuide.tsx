import { useEffect, useRef } from "react";
export function HelpGuide({
  open,
  close,
  cite,
}: {
  open: boolean;
  close: () => void;
  cite: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="help-dialog"
      onCancel={close}
      aria-labelledby="help-title"
    >
      <button
        className="dialog-close"
        type="button"
        onClick={close}
        aria-label="Close guide"
      >
        ×
      </button>
      <h2 id="help-title">Your first survival figure</h2>
      <p>
        SurvScope compares survival between patients with lower and higher
        expression of a gene. A cohort is a group of patients with one cancer.
        No coding is needed.
      </p>
      <ol>
        <li>Choose a cancer cohort and a gene. Start with the median.</li>
        <li>
          Check the group sizes, then choose{" "}
          <strong>Create survival plot</strong>.
        </li>
        <li>
          Double-click a label to edit it. Select objects to change colors,
          layout and size in Properties.
        </li>
        <li>
          Download SVG or PDF for a vector figure, or PNG for an image. Save a
          project to keep editing later.
        </li>
      </ol>
      <h3>Choosing a comparison</h3>
      <p>
        The median splits patients at the middle value. The mean splits at the
        average. A percentile splits at a point you choose. Custom percentile
        groups compare the two ends and leave the middle out, so fewer patients
        count. Equal values stay together, so group sizes may differ from the
        percentages.
      </p>
      <h3>Reading the curves</h3>
      <p>
        Each step down is an observed event. A higher curve means more patients
        are still event-free. A censor mark shows where follow-up ended with no
        event. Confidence bands show uncertainty. Number-at-risk tables show how
        many patients are still followed just before each time.
      </p>
      <dl>
        <dt>OS — overall survival</dt>
        <dd>Time to death from any cause.</dd>
        <dt>DSS — disease-specific survival</dt>
        <dd>Time to death from this cancer.</dd>
        <dt>PFI — progression-free interval</dt>
        <dd>
          Time to progression, recurrence or another event defined by the source
          study.
        </dd>
        <dt>DFI — disease-free interval</dt>
        <dd>Time to a new disease event after being disease-free.</dd>
      </dl>
      <h3>Understanding the numbers</h3>
      <p>
        <strong>n</strong> is the number of patients. <strong>e</strong> is the
        number of observed events. Patients whose follow-up ends with no event
        are censored, so e is never more than n. For OS, the event is death. The
        log-rank <strong>p-value</strong> tests the difference between the
        curves. The optional Benjamini–Hochberg <strong>q-value</strong> (turn
        on <strong>Show adjusted q-value</strong> in Properties → Survival
        details) adjusts only across this analysis's outcomes, not across other
        genes or groupings you try.
      </p>
      <p>
        The <strong>hazard ratio (HR)</strong> compares higher with lower
        expression. Above 1 means a higher event rate in the higher group. Below
        1 means a lower rate. HR is not a survival probability. NA means it
        could not be estimated.
      </p>
      <h3>TCGA and CPTAC</h3>
      <p>
        TCGA has up to four outcomes. CPTAC has overall survival only. Each
        outcome uses patients with follow-up for it, so counts can differ
        between panels. Some cohorts are very small. Check the counts, events
        and outcome notes.
      </p>
      <p>
        These are observational results. A gap or a small p-value does not show
        that the gene causes a survival difference or predicts treatment
        benefit.
      </p>
      <h3>Editing and navigation</h3>
      <p>
        Hover over an icon, or Tab to it, to see its name and shortcut. The top
        of Properties has align and distribute icons. The artboard icon switches
        between aligning to the page and to the selection. In Layers, the eye
        hides and the padlock locks.
      </p>
      <p>
        V selects, T edits text, H pans and Z zooms. Hold Space to pan.
        Shift-click or drag a box to select several objects. Text can be bold,
        italic, superscript or subscript. Enter adds a line. Escape finishes
        typing. Undo reverses an edit or a move.
      </p>
      <p>
        Double-click a legend entry to edit its name, n and e together. Each
        outcome has its own entries. These edits change the figure only. JSON
        and citations keep the real counts. Reset the selected item to restore
        its automatic label. The lower/higher group name fields rename all
        outcomes and restore the automatic counts.
      </p>
      <p>
        Collapse Analysis and Properties to give the figure more room. Fit fills
        the canvas. 100% shows the figure at its real size. These do not change
        the export size.
      </p>
      <p>
        Choose a font for the whole figure or for one text object. The menu
        shows a preview and the real font name. Exports embed the same fonts.
      </p>
      <h3>Citing your data</h3>
      <p>
        Use{" "}
        <button type="button" onClick={cite}>
          Cite this analysis
        </button>{" "}
        for references, BibTeX or RIS, a methods paragraph and the program
        acknowledgement. References match the shown result. TCGA and CPTAC have
        different sources.
      </p>
      <h3>Keeping your work</h3>
      <p>
        A <strong>project</strong> saves results, labels, annotations and
        appearance. A <strong>style preset</strong> saves appearance only. The
        JSON export holds the analysis results. A new gene or cohort keeps your
        style and updates analysis text.
      </p>
      <p>
        <a
          href="https://github.com/oncologylab/survscope/blob/main/docs/user-guide.md"
          target="_blank"
          rel="noreferrer"
        >
          Read the full guide
        </a>
      </p>
    </dialog>
  );
}
