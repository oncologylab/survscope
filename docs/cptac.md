# CPTAC support and source research

Reviewed against live GDC Data Release 46.0 (August 10, 2026), API 8.5.0,
on September 18, 2026.

SurvScope supports **CPTAC-3 RNA expression with overall survival (OS)**,
alongside the existing TCGA analyses. The source is open GDC STAR-Counts
`tpm_unstranded`, joined to GDC survival donors by case UUID during the build.
CPTAC is a separate cohort namespace: `CPTAC-3-PAAD` never aliases or pools with
TCGA `PAAD`. The application and Python readers use the same compact assets.

## Supported cohorts and observed coverage

These counts come from a live metadata audit with the exact filters in
[`cptac.py`](../src/survscope/cptac.py), not from project-wide totals. They are
a dated snapshot, not guaranteed counts for future builds. “Matched” requires
one unambiguously linked primary RNA specimen and a positive OS time.

| Cohort code | Cancer definition | Matched patients | Deaths |
| --- | --- | ---: | ---: |
| `CPTAC-3-GBM` | Glioblastoma / gliosarcoma | 150 | 115 |
| `CPTAC-3-HNSC` | Squamous carcinoma at specified head/neck sites | 87 | 29 |
| `CPTAC-3-LAML` | Acute myeloid leukemia | 147 | 100 |
| `CPTAC-3-LUAD` | Lung adenocarcinoma | 157 | 37 |
| `CPTAC-3-LUSC` | Lung squamous cell carcinoma | 85 | 25 |
| `CPTAC-3-PAAD` | Pancreatic ductal adenocarcinoma | 97 | 76 |
| `CPTAC-3-RCC` | Renal cell carcinoma, NOS in GDC | 177 | 30 |
| `CPTAC-3-SKCM` | Primary cutaneous melanoma | 123 | 41 |
| `CPTAC-3-STAD` | Gastric adenocarcinoma | 130 | 17 |
| `CPTAC-3-UCEC` | Endometrioid endometrial adenocarcinoma | 219 | 33 |
| `CPTAC-3-ASTRO` | Astrocytoma, NOS | 2 | 2 |
| `CPTAC-3-OLIGO` | Oligodendroglioma | 1 | 1 |
| `CPTAC-3-GLIOMA` | Glioma, NOS | 1 | 1 |
| `CPTAC-3-KIRP` | Papillary renal cell carcinoma | 9 | 1 |
| `CPTAC-3-KICH` | Chromophobe renal cell carcinoma | 2 | 0 |
| `CPTAC-3-FHRCC` | Hereditary leiomyomatosis-associated renal cell carcinoma | 1 | 0 |
| `CPTAC-3-UTUC` | Renal urothelial carcinoma | 1 | 1 |
| `CPTAC-3-SCCNOS` | Squamous carcinoma at an ill-defined site | 1 | 0 |

The 18 groups cover 1,390 matched patients in this audit. They include every
identifiable malignant primary-tumor group with eligible RNA and positive OS
found by an exhaustive CPTAC program query on this date. This is not a promise
of support for every future GDC diagnosis or every CPTAC assay. Eight groups
contain fewer than 20 patients. Sample counts are visible in the cohort selector;
these groups have an explicit small-sample note and may have no estimable group
comparison. One-patient or no-death cohorts cannot support meaningful survival
association estimates.

The RCC cohort retains the GDC NOS designation. It is not labeled clear-cell
RCC. Benign kidney lesions and unspecified diagnoses are excluded; other
malignant renal histologies have separate cohorts. GBM
excludes other gliomas; LUAD and LUSC have distinct histology filters. Discovery
and confirmatory samples can both occur within a GDC project; these cohorts
are defined by GDC clinical fields, not claimed to reproduce a publication's
discovery cohort.

All cohort queries were verified against the live API. A full PAAD build
was also tested: 59,317 uniquely mapped genes, 97 patients, 76 deaths, 19 assets,
13,946,921 bytes. It streamed 410,381,149 source bytes without saving STAR files.
The production workflow builds the complete catalog for all 18 CPTAC groups
and reuses the validated 33-cohort compact TCGA release without changing its
expression buckets, clinical arrays, or statistical results.

## Sources that informed the implementation

- [NCI's CPTAC overview](https://gdc.cancer.gov/about-gdc/contributed-genomic-data-cancer-research/clinical-proteomic-tumor-analysis-consortium-cptac)
  distinguishes GDC genomic data from PDC proteomics. Clinical metadata and
  expression quantification are open-access; controlled sequencing reads are
  unnecessary for this workflow.
- [GDC mRNA pipeline](https://docs.gdc.cancer.gov/Data/Bioinformatics_Pipelines/Expression_mRNA_Pipeline/)
  describes the expression workflow. Live STAR files contain GENCODE v36 gene
  IDs/names and `tpm_unstranded`; the builder reads TPM, not counts or FPKM.
- [GDC search and retrieval](https://docs.gdc.cancer.gov/API/Users_Guide/Search_and_Retrieval/)
  supplies case/file filtering, pagination, and download metadata. The builder
  verifies the advertised MD5 and byte count for every consumed STAR file and
  records SHA-256 provenance.
- [GDC survival API](https://docs.gdc.cancer.gov/API/Users_Guide/Data_Analysis/)
  supplies donor-level OS time and censoring. The build uses these records,
  not the API's aggregate curve or statistics. SurvScope computes its own
  expression split, KM curves, log-rank test, and Cox estimate.
- [GDC API release notes](https://docs.gdc.cancer.gov/API/Release_Notes/API_Release_Notes/)
  document the June 29, 2026 survival update: follow-up records now contribute
  censoring times, and unknown/unreported vital status is excluded. Using the
  current donor endpoint avoids freezing an outdated clinical-field rule.
- [PDC documentation](https://pdc.cancer.gov/pdc-docs/usage) describes protein
  assemblies and clinical/follow-up exports, useful for a future proteomics
  adapter with pinned study versions and assay-specific normalization.
- The [Payne Lab CPTAC package](https://github.com/PayneLab/cptac) provides
  curated multi-omics access and a
  [clinical outcomes example](https://paynelab.github.io/cptac/usecase09_clinical_outcomes.html).
  Its README currently reports Zenodo access difficulties. Its automatic
  download/storage behavior also differs from this repository's streaming
  build policy, so it is a research reference rather than a runtime dependency.

## Survival and sample rules

OS times remain in days in assets; plots divide by 30.4375 for months. A GDC
`censored` value of `true` becomes event `0`, and `false` becomes event `1`.
The case vital status must agree with censoring. Unknown status, nonfinite or
nonpositive time, and absent survival records do not become censored observations.
Conflicting status and duplicate donors fail the build.

CPTAC OS receives a **caution** badge because follow-up completeness varies.
The TCGA-CDR quality recommendations are not assigned to CPTAC. DSS, PFI and DFI
are null arrays marked **unavailable**, with explicit unavailable figure panels.
No recurrence field is relabeled as a TCGA-CDR endpoint. BH adjustment includes
only finite endpoint p-values, so CPTAC's OS q-value equals its OS p-value.

Solid-tumor cohorts use GDC `Primary Tumor` sample metadata. AML accepts primary
bone marrow or peripheral-blood cancer specimens, preferring bone marrow when
both are available. Normal, recurrent and metastatic samples are excluded.
Files linked to multiple samples or cases are excluded as ambiguous. Remaining
replicates are selected deterministically by sample-type priority, sample UUID,
then file UUID. This conservative rule can exclude otherwise useful samples;
the exclusion count is recorded instead of silently treating them as independent
patients. UUIDs and submitter IDs are not written to published assets.

Ambiguous gene symbols are excluded case-insensitively. All files in a cohort
must agree on gene mapping and gene-model version. One melanoma STAR file
declares `GENCODE vv36`; its 59,317 symbol/Ensembl mappings match the other
samples exactly. The builder normalizes only that observed header typo to
`GENCODE v36` and records counts of the original declarations in provenance.
Actual gene-model or mapping changes still fail the build. TPM is converted to
`log2(TPM+1)` and encoded to the existing uint16 format; exact median membership
corrections preserve the source grouping. The current TCGA statistical and
6.8-inch figure contract remains unchanged.

## Build and use

Build one full CPTAC cohort into a new, empty directory:

```bash
survscope-build-data \
  --cohorts CPTAC-3-PAAD \
  --data-version 2026.09.18 \
  --outdir data-build/cptac
python scripts/validate_data_release.py \
  --dir data-build/cptac --expected-cohorts 1
survscope --data-version 2026.09.18 --data-dir data-build/cptac \
  plot --gene SRD5A1 --cohort CPTAC-3-PAAD --format pdf svg png --json
```

Add `--genes SRD5A1 TP53` for a compact smoke fixture. This reduces the output
catalog, not source downloads: each selected STAR file must still be consumed
and checksummed. Up to three sample downloads run concurrently, with results
consumed in the fixed patient order and at most three buffered downloads.
A build keeps one cohort's gene values in memory to calculate
exact medians; it never writes a raw expression matrix. Metadata requests are
paginated; transient connection/HTTP errors retry, and incomplete or changing
responses fail explicitly.

For a combined release, use `--include-cptac` with the default 33 TCGA cohorts.
The manual `data-release.yml` workflow defaults to this 51-cohort build:

```bash
gh workflow run data-release.yml \
  -f data_version=2026.09.18 -f cohorts=all -f include_cptac=true \
  -f tcga_data_version=2026.07.28
```

The workflow downloads and verifies the existing compact TCGA archive, then
passes its extracted directory through `--tcga-release`. The builder validates
every checksum and all gene/cohort coverage before copying selected TCGA assets.
Each reused cohort records the source data version and manifest SHA-256.
Leave the workflow's `tcga_data_version` input blank for a full source refresh.

Use a fresh `data-vYYYY.MM.DD` tag for a production refresh. Validation checks
checksums (including the manifest), requested and gene coverage, endpoint shape,
asset count, and the 850 MiB budget. Pages additionally requires all 33 TCGA
cohorts and checks the final site size. It selects the newest immutable data
release unless a version is explicitly requested, and compiles the matching
`VITE_DATA_VERSION` into the static app. Browser requests stay on the same origin.

The Python default is `2026.09.18`; the bundled development web preview uses
the `2026.07.28` TCGA fixture. For a local CPTAC preview, copy compact output
under `web/public/data/2026.09.18` and build with
`VITE_DATA_VERSION=2026.09.18 npm run build`. Keep full generated catalogs out of
source control. Pages serves only the active data release to stay within its
size budget. For an archived analysis, extract that release's immutable GitHub
archive and pass both `--data-version` and `--data-dir` (or `DataStore` equivalents).

The six-gene live PAAD fixture in `tests/fixtures/cptac/2026.09.18` tests Python
and browser numerical parity and CPTAC/TCGA coexistence. It is not a production
catalog. Its input URLs, hashes and GDC release are in its manifest.

## Current limits

The live CPTAC-2 query returned no usable GDC OS donors, despite eligible RNA
for breast, colorectal, and ovarian/peritoneal cases. PDC's
[`clinicalPerStudy` API](https://pdc.cancer.gov/pdc/publicapi-documentation)
was also checked for the breast, colon, and ovarian study IDs linked by the
GDC overview. Thirteen queries returned no reported vital status, death time,
or follow-up; `PDC000116` returned clinical API errors and was not usable.
These RNA datasets are not presented as supported survival cohorts. A future
publication-specific clinical adapter would need explicit case matching,
endpoint definitions and time origins before enabling CPTAC-2.

Protein abundance, phosphoproteomics, and other PDC measurements are not TPM.
They require signed/missing-aware encoding, assay labels, protein-to-gene mapping
rules, and different cutoff units. This change does not feed those values through
the RNA/TPM analysis path.
