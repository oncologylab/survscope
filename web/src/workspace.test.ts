import { describe, expect, test } from "vitest";
import { defaultFigure } from "./figure";
import { alignObjects, moveObjects, roots, updateText } from "./editorModel";
import {
  normalizeGrouping,
  groupingFromQuery,
  groupingQuery,
  assignGroups,
} from "./grouping";
import { validateSettings, projectFile, readFigureFile } from "./project";
import {
  resolveProvenance,
  attachProvenance,
  bibliography,
  methodsText,
} from "./citations";
import releases from "./citation-releases.json";
import { analyzeGeneData } from "./statistics";
import { splitLines } from "./RichSvgText";
import type { GeneData, SurvivalAnalysis } from "./types";
// The clinical curves in this fixture remain aggregate, with no participant IDs.
const data: GeneData = {
  gene: {
    symbol: "GENE",
    ensembl: "ENSG001",
    row: 0,
    medians: Object.fromEntries(
      ["OS", "DSS", "PFI", "DFI"].map((e) => [e, { cutoff_tpm: 3, flips: [] }]),
    ) as any,
  },
  cohort: "PAAD",
  cohortLabel: "Pancreatic adenocarcinoma",
  dataVersion: "2026.09.18",
  scale: 1000,
  missing: 65535,
  expression: new Uint16Array([1000, 2000, 3000, 4000]),
  clinical: {
    schema_version: 1,
    cohort: "PAAD",
    sample_count: 4,
    endpoints: Object.fromEntries(
      ["OS", "DSS", "PFI", "DFI"].map((e) => [
        e,
        {
          time: [10, 20, 30, 40],
          event: [1, 0, 1, 1],
          quality: "recommended",
          quality_note: "",
        },
      ]),
    ) as any,
  },
};
const analysis = () => analyzeGeneData(data, "median");

describe("compatible neutral grouping names", () => {
  test("old links and inputs have identical membership and canonical output", () => {
    const canonical = normalizeGrouping({
      kind: "percentile_groups",
      lowerPercent: 20,
      upperPercent: 30,
    });
    const legacy = normalizeGrouping({
      kind: "extremes",
      lowerPercent: 20,
      upperPercent: 30,
    });
    expect(legacy).toEqual(canonical);
    expect(
      groupingFromQuery(
        new URLSearchParams("grouping=extremes&lower=20&upper=30"),
      ),
    ).toEqual(canonical);
    expect(groupingQuery(legacy).grouping).toBe("percentile_groups");
    const args = [
      [0, 0, 1, 2, 3, 3, 4],
      [0, 1, 2, 3, 4, 5, 6],
      { cutoff_tpm: 2, flips: [] },
    ] as const;
    expect(
      assignGroups(
        [...args[0]],
        [...args[1]],
        { ...args[2], flips: [] },
        legacy,
      ),
    ).toEqual(
      assignGroups(
        [...args[0]],
        [...args[1]],
        { ...args[2], flips: [] },
        canonical,
      ),
    );
  });
});
describe("document editing and migration", () => {
  test("moves a selected parent once and respects locks", () => {
    const s = defaultFigure(),
      n = moveObjects(s, ["panel.OS", "title.OS", "curve.low.OS"], 10, 20);
    expect(n.panels.OS.x - s.panels.OS.x).toBeCloseTo(10 / (6.8 * 72));
    expect(n.elements["title.OS"]).toBeUndefined();
    s.elements["panel.OS"] = { locked: true };
    expect(roots(["panel.OS", "title.OS"], s)).toEqual([]);
    expect(moveObjects(s, ["title.OS"], 10, 20)).toEqual(s);
    const group = defaultFigure();
    const atEdge = moveObjects(group, ["panel.OS", "source"], 1000, 1000);
    expect(atEdge.panels.OS.x + atEdge.panels.OS.width).toBeCloseTo(1);
    expect(atEdge.elements.source.dx).toBeCloseTo(
      (atEdge.panels.OS.x - group.panels.OS.x) * group.widthIn * 72,
    );
  });
  test("aligns and distributes annotations by their visible bounds", () => {
    const s = defaultFigure();
    s.annotations = [0, 1, 2].map((i) => ({
      id: String(i),
      kind: "text",
      text: "note",
      x: i * 0.2,
      y: i * 0.1,
      x2: 0,
      y2: 0,
      color: "#123456",
      fontSize: 10,
      lineWidth: 1,
    }));
    const ids = s.annotations.map((a) => `annotation.${a.id}`),
      boxes = new Map(
        ids.map((id, i) => [
          id,
          { x: i * 30, y: i * 10, width: 10, height: 10 },
        ]),
      );
    const n = alignObjects(s, ids, boxes, "top", false);
    expect(n.annotations[2].y).toBeCloseTo(0.2 - 20 / (6.8 * 72));
    const d = alignObjects(s, ids, boxes, "distribute-x", true);
    expect(d.annotations[1].x).toBeCloseTo(
      0.2 + ((6.8 * 72) / 2 - 5 - 30) / (6.8 * 72),
    );
  });
  test("round trips marked and rotated text, object flags, and multiple fonts", () => {
    let s = updateText(defaultFigure(), "title", [
      { text: "TP", bold: false },
      { text: "53", bold: true, script: "super" },
      { text: "\nβ", italic: true },
    ]);
    s.elements.title = {
      ...s.elements.title,
      rotation: 25,
      fontFamily: "Serif",
      align: "start",
      locked: true,
    };
    const file = projectFile(analysis(), s),
      r = readFigureFile(JSON.stringify(file));
    expect(file.version).toBe(2);
    expect(r.settings).toEqual(s);
    expect(splitLines(s.elements.title.runs!)).toHaveLength(2);
    expect(() =>
      validateSettings({
        ...s,
        elements: { "statistics.OS": { runs: [{ text: "p=0" }] } },
      }),
    ).toThrow(/computed/);
    expect(() =>
      validateSettings({
        ...s,
        elements: { title: { runs: [{ text: "x", script: "javascript" }] } },
      }),
    ).toThrow();
  });
  test("v1 imports preserve results and do not invent an upstream release", () => {
    const a = analysis();
    a.dataVersion = "2020.01.01";
    const r = readFigureFile(
      JSON.stringify({
        format: "survscope-project",
        version: 1,
        softwareVersion: "0.3.0",
        analysis: a,
        settings: defaultFigure(),
      }),
    );
    if (r.format !== "survscope-project") throw Error("wrong format");
    expect(r.analysis.endpoints).toEqual(a.endpoints);
    expect(r.analysis.provenance?.upstreamRelease).toBeNull();
    expect(r.analysis.provenance?.softwareVersion).toBe("0.3.0");
  });
});
describe("data citations", () => {
  test("every published cohort has source citations with program-specific outcomes", () => {
    const cohorts = Object.keys(releases["2026.09.18"]);
    expect(cohorts).toHaveLength(51);
    for (const cohort of cohorts) {
      const a = { ...analysis(), cohort },
        p = resolveProvenance(a);
      expect(p.citations.some((c) => c.role === "Source dataset")).toBe(true);
      const ids = p.citations.map((c) => c.id);
      expect(ids.includes("liu2018cdr")).toBe(!cohort.startsWith("CPTAC-"));
      expect(ids.includes("goldman2020xena")).toBe(
        !cohort.startsWith("CPTAC-"),
      );
      expect(p.upstreamRelease).toBe(
        cohort.startsWith("CPTAC-")
          ? "Data Release 46.0 - August 10, 2026"
          : null,
      );
    }
  });
  test("uses pancreatic originals and avoids assigning renal NOS or rare brain papers", () => {
    expect(
      resolveProvenance(analysis()).citations.some(
        (c) => c.doi === "10.1016/j.ccell.2017.07.007",
      ),
    ).toBe(true);
    expect(
      resolveProvenance({
        ...analysis(),
        cohort: "CPTAC-3-PAAD",
      }).citations.some((c) => c.doi === "10.1016/j.cell.2021.08.023"),
    ).toBe(true);
    for (const cohort of ["CPTAC-3-RCC", "CPTAC-3-KIRP", "CPTAC-3-OLIGO"])
      expect(
        resolveProvenance({ ...analysis(), cohort }).cohortPublicationNote,
      ).toContain("No cohort-specific");
  });
  test("exports reusable references and methods from the saved analysis, rejecting mismatched provenance", () => {
    const a = attachProvenance(analysis());
    expect(bibliography(a, "bibtex")).toContain("@article{liu2018cdr");
    expect(bibliography(a, "ris")).toContain(
      "DO  - 10.1016/j.cell.2018.02.052",
    );
    expect(methodsText(a)).toContain("0 middle patients excluded");
    expect(methodsText(a)).toContain("Cox model with Breslow ties");
    const file = projectFile(a, defaultFigure());
    file.analysis.provenance!.cohort = "BRCA";
    expect(() => readFigureFile(JSON.stringify(file))).toThrow(/provenance/);
    const bad = projectFile(attachProvenance(analysis()), defaultFigure());
    bad.analysis.provenance!.citations[0].url = "javascript:alert(1)";
    expect(() => readFigureFile(JSON.stringify(bad))).toThrow(/URL/);
  });
});
