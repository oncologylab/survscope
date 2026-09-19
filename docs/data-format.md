# Static data format

Each immutable data release contains one manifest, one anonymous clinical JSON
per cohort, and up to 16 expression ZIP buckets per cohort.

GitHub Releases wraps those files in one uncompressed tar archive to keep the
upload atomic and avoid secondary API rate limits. GitHub Pages unpacks the
archive and serves the individual files, so an analysis downloads only its
manifest, clinical asset, and selected expression bucket.

## Manifest

`manifest-{data_version}.json` records:

- schema and data version;
- transform, precision, missing-value sentinel, and sample-selection policy;
- source URLs and SHA-256 provenance;
- cohort labels, sample counts, asset names, and source-stream hashes;
- the searchable gene symbol/Ensembl catalog and deterministic bucket mapping;
- byte size and SHA-256 for every declared data asset.

The sample policy uses code `01` (Primary Solid Tumor) by default and code `03`
(Primary Blood Derived Cancer - Peripheral Blood) for LAML. The manifest stores
the policy and its GDC code-table source explicitly.

New builds include `program` and `sources` in each cohort record. Readers use
cohort-specific sources, falling back to top-level sources for older releases.
TCGA codes remain bare abbreviations (`PAAD`); CPTAC codes include the project
(`CPTAC-3-PAAD`). `requested_cohorts` records intended release coverage. These
require a schema-2 manifest when CPTAC is present. Legacy TCGA-only manifests
remain schema 1. Updated readers accept both versions; older Python clients reject
schema 2 instead of silently applying TCGA titles and provenance to CPTAC.
Clinical and expression bucket layouts retain their schema-1 representation.

CPTAC records additionally include `selection` (GDC project, site and histology
filters), `coverage`, `available_endpoints`, allowed `sample_types`, GDC release
metadata, metadata-response hashes, and a hash of the selected expression file
provenance. The aggregate hash avoids publishing case/sample/file UUID lists.

The deterministic bucket is the first byte of `SHA256(upper(gene_symbol))`
modulo 16, formatted as two hexadecimal digits.

## Clinical assets

`{COHORT}-clinical.json` contains aligned time and event arrays for OS, DSS,
PFI, and DFI. Missing values are JSON `null`. It also carries the TCGA-CDR
endpoint quality class and note. Sample and case identifiers are intentionally
omitted.

CPTAC uses the same four array slots, with OS from GDC and DSS/PFI/DFI filled
with nulls and `quality: "unavailable"`. OS uses `quality: "caution"` rather
than TCGA-CDR recommendations. Available times are in days, and events are
binary (death = 1, censored = 0).

## Expression buckets

`{COHORT}-bucket-{00..0f}.zip` has exactly two members:

- `meta.json`: row order, gene identifiers, scale/sentinel, exact median
  cutoffs, and sparse membership corrections;
- `expression.u16le`: row-major, little-endian unsigned 16-bit values with
  `sample_count` columns.

Finite expression is encoded as
`round(log2(TPM + 1) * 1000)`. `65535` represents missing expression. The
maximum quantization error is 0.0005 log2 units.

For the median mode, the runtime compares decoded TPM with the exact stored
cutoff and applies the sparse XOR correction indexes. Consequently the group
membership matches the source-precision calculation. Numeric custom cutoffs
use the decoded compact expression.

## Compatibility

Readers must reject unsupported `schema_version` values. Data releases are
immutable; a schema or source refresh creates a new data tag and manifest.
