import { describe, expect, test } from "vitest";
import {
  assignGroups,
  groupingFromQuery,
  groupingQuery,
  normalizeGrouping,
  quantile,
} from "./grouping";
import { defaultFigure, layoutFigure, reusableStyle } from "./figure";
import {
  presetFile,
  projectFile,
  readFigureFile,
  validateSettings,
} from "./project";
import {
  analyzeGeneData,
  atRisk,
  confidenceBounds,
  kmTimeline,
} from "./statistics";
import type { GeneData, GroupingSpec } from "./types";

function exampleData(): GeneData {
  return {
    gene: {
      symbol: "EXAMPLE",
      ensembl: "ENSG001",
      row: 0,
      medians: Object.fromEntries(
        ["OS", "DSS", "PFI", "DFI"].map((ep) => [
          ep,
          { cutoff_tpm: 3, flips: [] },
        ]),
      ) as unknown as GeneData["gene"]["medians"],
    },
    cohort: "PAAD",
    cohortLabel: "Pancreatic cancer",
    sourceExpression: "test RNA",
    sourceSurvival: "test outcomes",
    dataVersion: "2026.09.18",
    scale: 1000,
    missing: 65535,
    expression: new Uint16Array([0, 1000, 2000, 3000, 4000, 5000]),
    clinical: {
      endpoints: Object.fromEntries(
        ["OS", "DSS", "PFI", "DFI"].map((ep) => [
          ep,
          {
            time: [1, 2, 3, 4, 5, 6],
            event: [1, 0, 1, 1, 0, 1],
            quality: "caution",
            quality_note: "Example",
          },
        ]),
      ),
    } as GeneData["clinical"],
  };
}

describe("comparison boundaries", () => {
  test("normalizes aliases, preserves old links, and rejects malformed numbers", () => {
    expect(groupingFromQuery(new URLSearchParams("cutoff=median"))).toEqual({
      kind: "median",
    });
    expect(groupingFromQuery(new URLSearchParams("cutoff=10"))).toEqual({
      kind: "tpm",
      threshold: 10,
    });
    expect(
      normalizeGrouping({
        kind: "extremes",
        lowerPercent: 50,
        upperPercent: 50,
      }),
    ).toEqual({ kind: "median" });
    for (const spec of [
      { kind: "mean", threshold: 2 },
      { kind: "percentile", percentile: "75" },
      { kind: "percentile", percentile: 50, threshold: 10 },
      { kind: "extremes", lowerPercent: 60, upperPercent: 60 },
    ]) {
      expect(() => normalizeGrouping(spec as GroupingSpec)).toThrow();
    }
    expect(() => groupingFromQuery(new URLSearchParams("cutoff="))).toThrow();
    const spec: GroupingSpec = {
      kind: "extremes",
      lowerPercent: 20,
      upperPercent: 30,
    };
    expect(groupingFromQuery(new URLSearchParams(groupingQuery(spec)))).toEqual(
      spec,
    );
  });
  test("extreme comparisons keep ties together", () => {
    const groups = assignGroups(
      [0, 0, 1, 2, 3, 3, 3, 4],
      [0, 1, 2, 3, 4, 5, 6, 7],
      { cutoff_tpm: null, flips: [] },
      { kind: "extremes", lowerPercent: 25, upperPercent: 25 },
    );
    expect(groups.lower).toBe(0.75);
    expect(groups.upper).toBe(3);
    expect(groups.low.filter(Boolean)).toHaveLength(2);
    expect(groups.high.filter(Boolean)).toHaveLength(1);
    expect(
      quantile(
        [
          0, 0, 0, 0, 0, 0, 0, 0.9999999999999999, 0.9999999999999999,
          0.9999999999999999, 0.9999999999999999,
        ],
        0.7,
      ),
    ).toBe(0.9999999999999999);
  });
  test("risk counts include patients censored at a tied event time", () => {
    const timeline = kmTimeline([1, 1, 2], [1, 0, 1]);
    expect(timeline[0]).toMatchObject({ atRisk: 3, events: 1, censored: 1 });
    const curve = { n: 3, events: 2, xMonths: [], survival: [], timeline };
    expect(atRisk(curve, 1 / 30.4375)).toBe(3);
    expect(atRisk(curve, 1.5 / 30.4375)).toBe(1);
    expect(atRisk(curve, 3 / 30.4375)).toBe(0);
    expect(confidenceBounds(2 / 3, 1 / 6, 0.95)[0]).toBeCloseTo(
      0.2995071303590223,
      10,
    );
    expect(confidenceBounds(0, null, 0.95).every(Number.isNaN)).toBe(true);
  });
});

describe("portable editor projects", () => {
  test("round-trips dimensions, notes, unavailable statistics, and aggregate results", () => {
    const data = exampleData();
    data.clinical.endpoints.DSS.time.fill(null);
    const analysis = analyzeGeneData(data, "median"),
      settings = defaultFigure();
    settings.widthIn = 8;
    settings.heightIn = 5;
    settings.elements.title = {
      text: "Two lines\nSecond line",
      dx: 8,
      color: "#123456",
    };
    settings.annotations.push({
      id: "note-1",
      kind: "text",
      text: "<script>plain text</script>",
      x: 0.2,
      y: 0.2,
      x2: 0.5,
      y2: 0.4,
      fontSize: 10,
      lineWidth: 1,
      color: "#123456",
    });
    const restored = readFigureFile(
      JSON.stringify(projectFile(analysis, settings)),
    );
    expect(restored.format).toBe("survscope-project");
    if (restored.format !== "survscope-project") throw Error("wrong format");
    expect(restored.settings).toEqual(settings);
    expect(restored.analysis).toEqual(analysis);
    expect(JSON.stringify(restored)).not.toContain('"expression"');
  });
  test("presets and a new analysis clear custom text and annotations while retaining appearance", () => {
    const settings = defaultFigure();
    settings.lowColor = "#112233";
    settings.lowLabel = "Old sample";
    settings.elements.title = { text: "Old gene", dx: 20 };
    const restored = readFigureFile(JSON.stringify(presetFile(settings)));
    expect(restored.settings.elements.title).toEqual({ dx: 20 });
    expect(restored.settings.lowLabel).toBe("Low");
    expect(reusableStyle(settings).lowColor).toBe("#112233");
    expect(settings.elements.title.text).toBe("Old gene");
  });
  test("rejects unsupported versions, inconsistent counts, invalid axes, and moved curves", () => {
    const file = projectFile(
      analyzeGeneData(exampleData(), "median"),
      defaultFigure(),
    );
    expect(() =>
      readFigureFile(JSON.stringify({ ...file, version: 9 })),
    ).toThrow(/version/);
    file.analysis.endpoints.OS.n++;
    expect(() => readFigureFile(JSON.stringify(file))).toThrow(/counts/);
    const settings = defaultFigure();
    settings.axes.OS.xMax = 0;
    expect(() => validateSettings(settings)).toThrow(/maximum/);
    settings.axes.OS.xMax = null;
    settings.elements["curve.high.OS"] = { dx: 5 };
    expect(() => validateSettings(settings)).toThrow(/curves/);
  });
  test("layouts stay within the canvas at every supported size", () => {
    for (const size of [2, 6.8, 20])
      for (const layout of ["row", "grid", "column"] as const) {
        const settings = defaultFigure();
        settings.widthIn = size;
        settings.heightIn = size;
        expect(() =>
          validateSettings(layoutFigure(settings, layout)),
        ).not.toThrow();
      }
  });
});
