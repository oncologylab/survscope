export const ENDPOINTS = ["OS", "DSS", "PFI", "DFI"] as const;
export type Endpoint = (typeof ENDPOINTS)[number];

export interface GeneRecord {
  symbol: string;
  ensembl: string;
  bucket: string;
  cohorts: string[];
}

export interface CohortRecord {
  label: string;
  sample_count: number;
  gene_count: number;
  clinical_asset: string;
  bucket_assets: Record<string, string>;
}

export interface Manifest {
  schema_version: number;
  data_version: string;
  created_at: string;
  expression_encoding: {
    scale: number;
    missing: number;
    transform: string;
    maximum_quantization_error_log2: number;
  };
  sources: {
    expression: { label: string; pipeline: string };
    survival: { label: string; citation: string };
  };
  cohorts: Record<string, CohortRecord>;
  genes: GeneRecord[];
}

export interface ClinicalEndpoint {
  time: Array<number | null>;
  event: Array<number | null>;
  quality: "recommended" | "caution" | "not_recommended" | "unavailable";
  quality_note: string;
}

export interface ClinicalData {
  schema_version: number;
  cohort: string;
  sample_count: number;
  endpoints: Record<Endpoint, ClinicalEndpoint>;
}

export interface MedianRecord {
  cutoff_tpm: number | null;
  flips: number[];
}

export interface BucketGene {
  symbol: string;
  ensembl: string;
  row: number;
  medians: Record<Endpoint, MedianRecord>;
}

export interface BucketMeta {
  schema_version: number;
  cohort: string;
  sample_count: number;
  scale: number;
  missing: number;
  transform: string;
  genes: BucketGene[];
}

export interface GeneData {
  gene: BucketGene;
  cohort: string;
  cohortLabel: string;
  dataVersion: string;
  expression: Uint16Array;
  scale: number;
  missing: number;
  clinical: ClinicalData;
}

export interface Curve {
  xMonths: number[];
  survival: number[];
  n: number;
  events: number;
}

export interface EndpointResult {
  endpoint: Endpoint;
  quality: ClinicalEndpoint["quality"];
  qualityNote: string;
  n: number;
  nLow: number;
  nHigh: number;
  events: number;
  eventsLow: number;
  eventsHigh: number;
  cutoffTpm: number;
  logrankChi2: number;
  logrankP: number;
  logrankQ: number;
  coxHr: number;
  coxP: number;
  low: Curve;
  high: Curve;
  warning: string;
}

export interface SurvivalAnalysis {
  gene: string;
  ensembl: string;
  cohort: string;
  cohortLabel: string;
  cutoff: "median" | number;
  dataVersion: string;
  endpoints: Record<Endpoint, EndpointResult>;
}
