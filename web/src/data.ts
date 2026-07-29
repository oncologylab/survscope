import { unzipSync } from "fflate";

import type {
  BucketMeta,
  ClinicalData,
  GeneData,
  GeneRecord,
  Manifest,
} from "./types";

export const DATA_VERSION = "2026.07.28";

const dataRoot = `${import.meta.env.BASE_URL}data/${DATA_VERSION}`;
let manifestPromise: Promise<Manifest> | null = null;
const clinicalCache = new Map<string, Promise<ClinicalData>>();
const bucketCache = new Map<string, Promise<{ meta: BucketMeta; matrix: Uint8Array }>>();

async function checkedFetch(url: string): Promise<Response> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Data asset request failed (${response.status}): ${url}`);
  }
  return response;
}

export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= checkedFetch(
    `${dataRoot}/manifest-${DATA_VERSION}.json`,
  ).then((response) => response.json() as Promise<Manifest>);
  return manifestPromise;
}

function findGene(manifest: Manifest, query: string, cohort: string): GeneRecord {
  const normalized = query.trim().toUpperCase();
  const gene = manifest.genes.find(
    (item) =>
      (item.symbol.toUpperCase() === normalized ||
        item.ensembl.toUpperCase() === normalized) &&
      item.cohorts.includes(cohort),
  );
  if (!gene) {
    throw new Error(`${query} is not available for TCGA-${cohort}.`);
  }
  return gene;
}

function loadClinical(manifest: Manifest, cohort: string): Promise<ClinicalData> {
  const cached = clinicalCache.get(cohort);
  if (cached) return cached;
  const promise = checkedFetch(
    `${dataRoot}/${manifest.cohorts[cohort].clinical_asset}`,
  ).then((response) => response.json() as Promise<ClinicalData>);
  clinicalCache.set(cohort, promise);
  return promise;
}

function loadBucket(
  manifest: Manifest,
  cohort: string,
  bucket: string,
): Promise<{ meta: BucketMeta; matrix: Uint8Array }> {
  const key = `${cohort}:${bucket}`;
  const cached = bucketCache.get(key);
  if (cached) return cached;
  const asset = manifest.cohorts[cohort].bucket_assets[bucket];
  if (!asset) {
    throw new Error(`TCGA-${cohort} has no data bucket ${bucket}.`);
  }
  const promise = checkedFetch(`${dataRoot}/${asset}`)
    .then((response) => response.arrayBuffer())
    .then((buffer) => {
      const files = unzipSync(new Uint8Array(buffer));
      const meta = JSON.parse(
        new TextDecoder().decode(files["meta.json"]),
      ) as BucketMeta;
      return { meta, matrix: files["expression.u16le"] };
    });
  bucketCache.set(key, promise);
  return promise;
}

function readExpression(
  matrix: Uint8Array,
  row: number,
  sampleCount: number,
): Uint16Array {
  const values = new Uint16Array(sampleCount);
  const view = new DataView(matrix.buffer, matrix.byteOffset, matrix.byteLength);
  const offset = row * sampleCount * 2;
  for (let index = 0; index < sampleCount; index += 1) {
    values[index] = view.getUint16(offset + index * 2, true);
  }
  return values;
}

export async function loadGeneData(
  geneQuery: string,
  cohort: string,
): Promise<GeneData> {
  const manifest = await loadManifest();
  const geneIndex = findGene(manifest, geneQuery, cohort);
  const [clinical, bucket] = await Promise.all([
    loadClinical(manifest, cohort),
    loadBucket(manifest, cohort, geneIndex.bucket),
  ]);
  const gene = bucket.meta.genes.find(
    (item) => item.symbol.toUpperCase() === geneIndex.symbol.toUpperCase(),
  );
  if (!gene) {
    throw new Error(`${geneIndex.symbol} is missing from its data bucket.`);
  }
  return {
    gene,
    cohort,
    cohortLabel: manifest.cohorts[cohort].label,
    dataVersion: manifest.data_version,
    expression: readExpression(
      bucket.matrix,
      gene.row,
      bucket.meta.sample_count,
    ),
    scale: bucket.meta.scale,
    missing: bucket.meta.missing,
    clinical,
  };
}
