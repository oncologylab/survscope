# Data format

A data release has one manifest, one clinical JSON per cohort, and up to 16 expression ZIP buckets per cohort. Releases never change. New sources or schemas get a new data tag.

GitHub Releases stores all files in one uncompressed tar, so the upload is atomic. Pages serves the files one by one. An analysis loads only the manifest, one clinical file and one bucket.

## Manifest

`manifest-{data_version}.json` holds:

- schema and data version
- transform, precision, missing-value sentinel, sample policy
- source URLs and SHA-256 provenance
- cohort labels, sample counts, asset names, source-stream hashes
- gene symbol/Ensembl catalog and bucket map
- size and SHA-256 of every asset

Sample policy: code `01` (Primary Solid Tumor), or `03` (Primary Blood Derived Cancer - Peripheral Blood) for LAML. The GDC code-table source is stored too.

Bucket = first byte of `SHA256(upper(gene_symbol))` mod 16, as two hex digits.

Cohort codes: TCGA is bare (`PAAD`). CPTAC includes the project (`CPTAC-3-PAAD`). Each cohort has `program` and `sources` (older releases use top-level sources). `requested_cohorts` lists intended coverage.

CPTAC cohorts also have `selection` (project, site, histology filters), `coverage`, `available_endpoints`, `sample_types`, GDC release data, response hashes, and one hash over the chosen expression files (instead of UUID lists).

| `schema_version` | Used for |
| --- | --- |
| 1 | TCGA-only manifests |
| 2 | Manifests with CPTAC |

Readers must reject unknown versions. Older Python clients reject schema 2. Clinical and bucket files are the same in both.

## Clinical assets

`{COHORT}-clinical.json` has time and event arrays for OS, DSS, PFI and DFI.

- Time is in days. Event: 1 = event, 0 = censored. Missing = `null`.
- TCGA includes the TCGA-CDR quality class and note.
- CPTAC: OS from GDC with `quality: "caution"`. Other outcomes are null with `quality: "unavailable"`.
- No sample or case IDs.

## Expression buckets

`{COHORT}-bucket-{00..0f}.zip` has two files:

| File | Content |
| --- | --- |
| `meta.json` | Row order, gene IDs, scale, sentinel, exact median cutoffs, sparse membership corrections |
| `expression.u16le` | Row-major little-endian uint16, `sample_count` columns |

Value = `round(log2(TPM + 1) * 1000)`. `65535` = missing. Maximum error is 0.0005 log2 units.

The median compares decoded TPM with the exact cutoff, then applies XOR corrections. So it matches full precision. Other groupings use decoded values. See [methods](methods.md).

## Groupings and figure projects

Analysis JSON has the grouping, lower/upper thresholds, valid and excluded-middle counts, Cox-fit status and method version `1`. Two-threshold groupings set `cutoff_tpm`/`cutoffTpm` to null. Python uses snake_case. The browser uses camelCase. Grouping parameters are `lowerPercent`/`upperPercent` in both.

Browser projects hold an analysis snapshot, aggregate KM and risk timelines, and figure settings. No expression, matrices or patient IDs. A project keeps its own data version. Presets leave out analysis text and notes. See [project format](development.md#editor-and-project-format).
