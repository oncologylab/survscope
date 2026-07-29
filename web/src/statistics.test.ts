import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { unzipSync } from "fflate";
import { describe, expect, test } from "vitest";

import { analyzeGeneData, bhFdr } from "./statistics";
import type {
  BucketMeta,
  ClinicalData,
  GeneData,
  Manifest,
} from "./types";

function referenceGene(): GeneData {
  const root = resolve("public/data/2026.07.28");
  const manifest = JSON.parse(
    readFileSync(resolve(root, "manifest-2026.07.28.json"), "utf8"),
  ) as Manifest;
  const index = manifest.genes.find((gene) => gene.symbol === "SRD5A1")!;
  const clinical = JSON.parse(
    readFileSync(resolve(root, "PAAD-clinical.json"), "utf8"),
  ) as ClinicalData;
  const files = unzipSync(
    readFileSync(resolve(root, manifest.cohorts.PAAD.bucket_assets[index.bucket])),
  );
  const meta = JSON.parse(
    new TextDecoder().decode(files["meta.json"]),
  ) as BucketMeta;
  const gene = meta.genes.find((item) => item.symbol === "SRD5A1")!;
  const matrix = files["expression.u16le"];
  const view = new DataView(matrix.buffer, matrix.byteOffset, matrix.byteLength);
  const expression = new Uint16Array(meta.sample_count);
  const offset = gene.row * meta.sample_count * 2;
  for (let sample = 0; sample < meta.sample_count; sample += 1) {
    expression[sample] = view.getUint16(offset + sample * 2, true);
  }
  return {
    gene,
    cohort: "PAAD",
    cohortLabel: manifest.cohorts.PAAD.label,
    dataVersion: manifest.data_version,
    expression,
    scale: meta.scale,
    missing: meta.missing,
    clinical,
  };
}

describe("browser survival statistics", () => {
  test("matches the SRD5A1 reference", () => {
    const result = analyzeGeneData(referenceGene(), "median");
    expect(result.endpoints.OS.n).toBe(177);
    expect(result.endpoints.OS.nLow).toBe(89);
    expect(result.endpoints.OS.logrankP).toBeCloseTo(0.0017777122420538, 8);
    expect(result.endpoints.OS.logrankQ).toBeCloseTo(0.0068997729476924, 8);
    expect(result.endpoints.OS.coxHr).toBeCloseTo(1.929912608978088, 6);
    expect(result.endpoints.DFI.n).toBe(69);
    expect(result.endpoints.DFI.coxHr).toBeCloseTo(2.143639694009769, 5);
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
});
