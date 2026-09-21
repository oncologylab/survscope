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
        expression of a gene. A cohort is a group of patients with a particular
        cancer. No coding is needed.
      </p>
      <ol>
        <li>
          Choose a cancer cohort and gene. Start with the default median
          comparison.
        </li>
        <li>
          Check the group sizes, then choose{" "}
          <strong>Create survival plot</strong>.
        </li>
        <li>
          Double-click a label to edit directly on the figure. Select objects to
          change colors, layout, and size in Properties.
        </li>
        <li>
          Download SVG or PDF for a vector figure, or PNG for an image. Save a
          project to continue editing later.
        </li>
      </ol>
      <h3>Choosing a comparison</h3>
      <p>
        The median divides patients around the middle expression value. The mean
        uses the average. Percentiles let you choose another dividing point.
        Custom percentile groups compare the lower and upper ends and leave
        middle patients out, so fewer patients contribute to the result. Equal
        expression values stay together in new groupings; actual group sizes may
        differ from the requested percentages.
      </p>
      <h3>Reading the curves</h3>
      <p>
        Each downward step marks an observed event. A higher curve indicates a
        higher estimated probability of remaining event-free. Censor marks
        indicate follow-up ending without that event being observed. Confidence
        bands show uncertainty; number-at-risk tables show how many people are
        still followed just before each displayed time.
      </p>
      <dl>
        <dt>OS — overall survival</dt>
        <dd>Time until death from any cause.</dd>
        <dt>DSS — disease-specific survival</dt>
        <dd>Time until death attributed to this cancer.</dd>
        <dt>PFI — progression-free interval</dt>
        <dd>
          Time until progression, recurrence, or another qualifying event
          defined by the source study.
        </dd>
        <dt>DFI — disease-free interval</dt>
        <dd>
          Time until a qualifying disease event after a patient was considered
          disease-free.
        </dd>
      </dl>
      <h3>Understanding the numbers</h3>
      <p>
        <strong>n</strong> is the number of patients and <strong>e</strong> is
        the number of observed events. Patients whose follow-up ends without the
        event are censored, so e cannot exceed n. The counts are equal when
        every included patient has an observed event. For OS, the event is
        death. The log-rank <strong>p-value</strong> tests a difference between
        the curves. The optional <strong>q-value</strong> is off by default;
        enable <strong>Show adjusted q-value</strong> in Properties → Survival
        details to include it. It adjusts for the available
        outcomes in this one gene/grouping analysis; it does not adjust for
        trying other genes or grouping choices. With one tested outcome, as in
        current CPTAC analyses, q equals p and the figure shows p only. With
        several outcomes, some adjusted values can still equal p; rounding can
        also make close values look the same.
      </p>
      <p>
        The <strong>hazard ratio (HR)</strong> compares higher with lower
        expression. Values above 1 indicate a higher estimated event rate in the
        higher-expression group; below 1 indicate a lower rate. HR is not a
        survival probability. NA means an estimate could not be calculated
        reliably.
      </p>
      <h3>TCGA and CPTAC</h3>
      <p>
        TCGA offers four outcomes where available. Current CPTAC cohorts offer
        overall survival only. Outcomes use patients with available follow-up,
        so counts may differ between panels. Some cohorts are very small; check
        counts, events, and the outcome notes.
      </p>
      <p>
        These are observational comparisons. A visible gap or small p-value does
        not establish that the gene causes a survival difference or predicts
        treatment benefit.
      </p>
      <h3>Editing and navigation</h3>
      <p>
        Hover over an icon or focus it with Tab to see its command and shortcut.
        The top of Properties has alignment and distribution icons; the artboard
        icon switches between page and selection alignment. Eye and padlock
        icons control visibility and locking in Layers.
      </p>
      <p>
        V selects objects, T edits text, H pans, and Z zooms. Hold Space to pan
        temporarily. Shift-click or drag a selection rectangle for multiple
        objects. Use the alignment icons to arrange objects, and Layers to hide
        or lock them. Text supports bold, italic, superscripts, and subscripts.
        Enter starts a new line; Escape finishes typing. Undo restores a
        completed edit or movement.
      </p>
      <p>
        Double-click a complete legend entry to edit its name, n, and e
        together. Each outcome has its own entries. These edits affect figure
        text only; analysis JSON and citations retain the calculated counts.
        Reset the selected item to restore its automatic label. The lower/higher
        group name fields rename all outcomes and restore their automatic
        counts.
      </p>
      <p>
        Analysis and Properties can be collapsed to give the figure more space.
        Fit fills the available canvas; 100% shows the figure at its nominal
        screen size. These controls do not change export dimensions.
      </p>
      <p>
        Choose a font for the whole figure or a selected text object. Seven
        bundled families include Arial/Helvetica-style Liberation Sans, Carlito,
        Lato, Source Sans 3, and Source Serif 4. The menu identifies the actual
        font and shows a preview. Familiar-name alternatives are labeled;
        exports embed the same fonts used on the figure.
      </p>
      <h3>Citing your data</h3>
      <p>
        Use{" "}
        <button type="button" onClick={cite}>
          Cite this analysis
        </button>{" "}
        for references, BibTeX or RIS downloads, a methods paragraph, and the
        data-program acknowledgement. References follow the displayed analysis.
        TCGA and CPTAC use different clinical sources; current CPTAC analyses
        use RNA expression and overall survival.
      </p>
      <h3>Keeping your work</h3>
      <p>
        A <strong>project</strong> saves results, labels, annotations, and
        appearance. A <strong>style preset</strong> saves reusable appearance.
        The ordinary JSON export contains analysis results. Changing genes or
        cohorts keeps styling and refreshes analysis-specific text.
      </p>
      <p>
        <a
          href="https://github.com/oncologylab/survscope/blob/main/docs/user-guide.md"
          target="_blank"
          rel="noreferrer"
        >
          Read the illustrated guide
        </a>
      </p>
    </dialog>
  );
}
