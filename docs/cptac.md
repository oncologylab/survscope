# CPTAC

Checked against GDC Data Release 46.0 (August 10, 2026), API 8.5.0, on September 18, 2026.

SurvScope supports CPTAC-3 RNA expression with overall survival (OS). Expression is GDC STAR-Counts `tpm_unstranded`. The build joins it to GDC survival donors by case UUID. CPTAC cohorts are separate from TCGA: `CPTAC-3-PAAD` is never merged with TCGA `PAAD`. The app and Python use the same compact assets.

## Supported cohorts and observed coverage

Counts come from a metadata audit using the filters in [`cptac.py`](../src/survscope/cptac.py). They are a dated snapshot. Future builds may differ. “Matched” means one clearly linked primary RNA sample and a positive OS time.

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

- The 18 groups have 1,390 matched patients. They are every malignant primary-tumor group with RNA and positive OS found on that date.
- Eight groups have fewer than 20 patients. They show a small-sample note and may have no result.
- RCC keeps the GDC "NOS" label. It is not clear-cell RCC. Other renal types have their own cohorts. Benign lesions are left out.
- GBM leaves out other gliomas. LUAD and LUSC use separate histology filters.
- Cohorts follow GDC clinical fields. They do not try to match a paper's cohort.

The [data-v2026.09.18 release](https://github.com/oncologylab/survscope/releases/tag/data-v2026.09.18) has all 18 CPTAC groups and all 33 TCGA cohorts: 59,317 genes, 869 assets, 818,907,113 bytes. Its 561 TCGA assets are byte-identical to the `2026.07.28` release. All files passed checksum and coverage checks. [Validation](methods.md#validation) covers all 51 cohorts.

## Survival and sample rules

Survival:

- OS time is in days. GDC `censored: true` is event `0`. `false` is event `1`.
- Vital status must agree with censoring. Conflicts or duplicate donors stop the build.
- Unknown status, missing records and time ≤ 0 are dropped, not censored.
- OS has a caution badge because follow-up varies. TCGA-CDR quality labels are not used.
- DSS, PFI and DFI are empty and marked unavailable.
- With one p-value, q equals p. The figure shows p only.

Samples:

- Solid tumors use GDC `Primary Tumor` samples. AML uses primary bone marrow or blood, preferring bone marrow.
- Normal, recurrent and metastatic samples are left out.
- Files linked to more than one sample or case are left out.
- Replicates are picked by sample-type priority, then sample UUID, then file UUID. The number dropped is recorded.
- No UUIDs or submitter IDs are published.

Genes:

- Ambiguous symbols are dropped (case-insensitive).
- All files in a cohort must use the same gene mapping and GENCODE version. One melanoma file says `GENCODE vv36`. Its 59,317 mappings match the rest, so the builder fixes this typo to `GENCODE v36` and records it. Any real change stops the build.
- TPM is stored as `log2(TPM+1)` in the TCGA format, with exact median corrections.

## Build and use

Build one CPTAC cohort into a new, empty folder:

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

- `--genes SRD5A1 TP53` makes a small test fixture. It still downloads and checks every STAR file.
- Up to three downloads run at once. Results are used in a fixed patient order.
- The build keeps one cohort in memory to compute exact medians. It never writes a raw matrix.
- Network errors retry. Incomplete or changing responses stop the build.

For a combined release, add `--include-cptac` to the 33 TCGA cohorts. The `data-release.yml` workflow does this by default ([command](development.md#compact-data-and-coverage)). It downloads and checks the TCGA archive and passes it with `--tcga-release`. Each reused cohort records its source version and manifest SHA-256.

Deploy rules are in [development](development.md#deployment). Pages also requires all 33 TCGA cohorts and, from 2026.09.18 on, all 18 CPTAC groups.

For a local CPTAC preview, copy the output to `web/public/data/2026.09.18` and run `VITE_DATA_VERSION=2026.09.18 npm run build`. Python defaults to `2026.09.18`.

The six-gene PAAD fixture in `tests/fixtures/cptac/2026.09.18` tests Python/browser agreement and CPTAC/TCGA together. Its manifest lists its sources.

## Sources

- [NCI CPTAC overview](https://gdc.cancer.gov/about-gdc/contributed-genomic-data-cancer-research/clinical-proteomic-tumor-analysis-consortium-cptac): GDC has open genomic and clinical data. PDC has proteomics.
- [GDC mRNA pipeline](https://docs.gdc.cancer.gov/Data/Bioinformatics_Pipelines/Expression_mRNA_Pipeline/): STAR files use GENCODE v36. The builder reads `tpm_unstranded`.
- [GDC search and retrieval](https://docs.gdc.cancer.gov/API/Users_Guide/Search_and_Retrieval/): file queries. The builder checks each file's MD5 and size and records SHA-256.
- [GDC survival API](https://docs.gdc.cancer.gov/API/Users_Guide/Data_Analysis/): per-donor OS time and censoring. SurvScope computes its own statistics.
- [GDC API release notes](https://docs.gdc.cancer.gov/API/Release_Notes/API_Release_Notes/): since June 29, 2026, follow-up adds censoring times and unknown status is excluded.
- [PDC documentation](https://pdc.cancer.gov/pdc-docs/usage): protein data, for possible future use.
- [Payne Lab CPTAC package](https://github.com/PayneLab/cptac) and [clinical outcomes example](https://paynelab.github.io/cptac/usecase09_clinical_outcomes.html): reference only. It downloads and stores data, which this build does not do.

## Current limits

- CPTAC-2 has RNA but no usable GDC OS data. PDC [`clinicalPerStudy`](https://pdc.cancer.gov/pdc/publicapi-documentation) also gave no survival data for the breast, colon and ovarian studies (13 empty queries; `PDC000116` returned errors).
- Protein data are not TPM. They need different encoding, units and gene mapping. They are not included.
