import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { unzipSync } from "fflate";
import { describe, expect, test } from "vitest";

import { analyzeGeneData, bhFdr } from "./statistics";
import { cohortDisplayName, figureFilename } from "./cohorts";
import type { BucketMeta, ClinicalData, GeneData, Manifest } from "./types";

function referenceGene(
  root = resolve("public/data/2026.07.28"),
  version = "2026.07.28",
  cohort = "PAAD",
): GeneData {
  const manifest = JSON.parse(
    readFileSync(resolve(root, `manifest-${version}.json`), "utf8"),
  ) as Manifest;
  const index = manifest.genes.find((gene) => gene.symbol === "SRD5A1")!;
  const clinical = JSON.parse(
    readFileSync(
      resolve(root, manifest.cohorts[cohort].clinical_asset),
      "utf8",
    ),
  ) as ClinicalData;
  const files = unzipSync(
    readFileSync(
      resolve(root, manifest.cohorts[cohort].bucket_assets[index.bucket]),
    ),
  );
  const meta = JSON.parse(
    new TextDecoder().decode(files["meta.json"]),
  ) as BucketMeta;
  const gene = meta.genes.find((item) => item.symbol === "SRD5A1")!;
  const matrix = files["expression.u16le"];
  const view = new DataView(
    matrix.buffer,
    matrix.byteOffset,
    matrix.byteLength,
  );
  const expression = new Uint16Array(meta.sample_count);
  const offset = gene.row * meta.sample_count * 2;
  for (let sample = 0; sample < meta.sample_count; sample += 1) {
    expression[sample] = view.getUint16(offset + sample * 2, true);
  }
  return {
    gene,
    cohort,
    cohortLabel: manifest.cohorts[cohort].label,
    sourceExpression: (manifest.cohorts[cohort].sources ?? manifest.sources)
      .expression.label,
    sourceSurvival: (manifest.cohorts[cohort].sources ?? manifest.sources)
      .survival.label,
    dataVersion: manifest.data_version,
    expression,
    scale: meta.scale,
    missing: meta.missing,
    clinical,
  };
}

describe("browser survival statistics", () => {
  test("matches the live CPTAC fixture and Python analysis", () => {
    const data = referenceGene(
      resolve("../tests/fixtures/cptac/2026.09.18"),
      "2026.09.18",
      "CPTAC-3-PAAD",
    );
    const result = analyzeGeneData(data, "median");
    expect(result.endpoints.OS.n).toBe(97);
    expect(result.endpoints.OS.events).toBe(76);
    expect(result.endpoints.OS.nLow).toBe(49);
    expect(result.endpoints.OS.nHigh).toBe(48);
    // Preserve the Python reference through the matching bounded Cox solver.
    expect(result.endpoints.OS.logrankP).toBeCloseTo(0.21480036623609935, 12);
    expect(result.endpoints.OS.coxHr).toBeCloseTo(1.333170308908182, 8);
    expect(result.endpoints.OS.logrankQ).toBe(result.endpoints.OS.logrankP);
    expect(result.sourceSurvival).toBe("GDC CPTAC overall survival");
    for (const endpoint of ["DSS", "PFI", "DFI"] as const) {
      expect(result.endpoints[endpoint].quality).toBe("unavailable");
      expect(result.endpoints[endpoint].n).toBe(0);
      expect(result.endpoints[endpoint].logrankP).toBeNaN();
    }
    expect(cohortDisplayName(result.cohort)).toBe("CPTAC-3-PAAD");
    expect(figureFilename(result.gene, result.cohort, "pdf")).toBe(
      "SRD5A1_CPTAC_3_PAAD_KM_survival.pdf",
    );
    expect(figureFilename(result.gene, "PAAD", "pdf")).toBe(
      "SRD5A1_TCGA_PAAD_KM_survival.pdf",
    );
  });

  test("matches the SRD5A1 reference", () => {
    const result = analyzeGeneData(referenceGene(), "median");
    expect(result.endpoints.OS.n).toBe(177);
    expect(result.endpoints.OS.nLow).toBe(89);
    expect(result.endpoints.OS.logrankP).toBeCloseTo(0.0017777122420538, 12);
    expect(result.endpoints.OS.logrankQ).toBeCloseTo(0.0068997729476924, 12);
    expect(result.endpoints.OS.coxHr).toBeCloseTo(1.929912608978088, 8);
    expect(result.endpoints.DFI.n).toBe(69);
    expect(result.endpoints.DFI.coxHr).toBeCloseTo(2.143639694009769, 8);
  });

  test("supports custom TPM cutoffs", () => {
    const result = analyzeGeneData(referenceGene(), 10);
    expect(result.endpoints.OS.cutoffTpm).toBe(10);
    expect(result.endpoints.OS.nLow + result.endpoints.OS.nHigh).toBe(177);
  });

  test("adjusts only finite p-values", () => {
    const result = bhFdr([0.01, Number.NaN, 0.04, 0.03]);
    expect(result[0]).toBeCloseTo(0.03);
    expect(result[1]).toBeNaN();
    expect(result[2]).toBeCloseTo(0.04);
    expect(result[3]).toBeCloseTo(0.04);
  });

  test("renders an endpoint with a null median and no observations as NA", () => {
    const data = referenceGene();
    data.clinical.endpoints.DSS.time = data.clinical.endpoints.DSS.time.map(
      () => null,
    );
    data.gene.medians.DSS = { cutoff_tpm: null, flips: [] };
    const result = analyzeGeneData(data, "median");
    expect(result.endpoints.DSS.n).toBe(0);
    expect(result.endpoints.DSS.cutoffTpm).toBeNaN();
    expect(result.endpoints.DSS.logrankP).toBeNaN();
    expect(result.endpoints.DSS.warning).toBe("No endpoint-valid samples.");
  });
});
