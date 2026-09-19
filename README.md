# SurvScope

[![CI](https://github.com/oncologylab/survscope/actions/workflows/ci.yml/badge.svg)](https://github.com/oncologylab/survscope/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/survscope.svg)](https://pypi.org/project/survscope/)
[![Pages](https://img.shields.io/badge/app-GitHub%20Pages-147d77)](https://oncologylab.github.io/survscope/)

SurvScope creates reproducible, publication-style TCGA and CPTAC Kaplan–Meier survival
plots from a compact, immutable data release. The website is a pure static
application: it has no server, sends no biomedical API requests at runtime, and
can export SVG, vector PDF, PNG, or analysis JSON directly in the browser.

**Web application:** <https://oncologylab.github.io/survscope/>

## Quick start

```bash
python -m pip install \
  https://github.com/oncologylab/survscope/releases/download/v0.2.0/survscope-0.2.0-py3-none-any.whl
survscope plot \
  --gene SRD5A1 \
  --cohort PAAD \
  --cutoff median \
  --format pdf svg png \
  --outdir plots
```

The command downloads only the static manifest, one small clinical asset, and
the bucket containing the selected gene. Use `--no-cache` to avoid retaining
those selected chunks.

The tested Python wheel is published on GitHub Releases. PyPI publication is
pending its one-time Trusted Publisher registration; maintainers can follow
the [publishing setup](docs/publishing.md).

Python usage:

```python
import survscope

analysis = survscope.analyze("SRD5A1", "PAAD", cutoff="median")
outputs = survscope.plot(analysis, formats=("pdf", "svg"), output_dir="plots")
```

**Cohort coverage:** 33 TCGA cohorts and 18 CPTAC-3 tumor groups with matched
RNA expression and overall survival, using separate codes such as `CPTAC-3-PAAD`.
The additional rare groups can contain only one or two patients; cohort labels
show sample counts and empty/no-event comparisons return unavailable statistics.
CPTAC-2 currently lacks usable matched survival outcomes in the sources checked.
See [CPTAC sources, coverage, and build instructions](docs/cptac.md).
Protein abundance is not included in the TPM workflow.

```bash
survscope plot --gene SRD5A1 --cohort CPTAC-3-PAAD --format pdf svg png
```

## What is reproduced

The TCGA reference figure contract is:

- primary cancer samples (code `01` for solid tumors and LAML code `03` for
  primary peripheral-blood cancer);
- endpoint-specific median expression split, with `High` defined strictly as
  expression greater than the cutoff;
- OS, DSS, PFI, and DFI in a 2×2, 6.8-inch square figure;
- Kaplan–Meier curves, two-sided log-rank p-value, binary Cox HR using Breslow
  ties, and Benjamini–Hochberg q-value across valid endpoints;
- GDC STAR TPM expression and PanCanAtlas TCGA-CDR survival outcomes;
- the existing blue/red palette, Liberation Sans in Matplotlib and Helvetica/Arial
  in the browser, annotation
  formatting, and `{GENE}_TCGA_{COHORT}_KM_survival` filename.

Numeric cutoffs are entered as TPM. Static expression is encoded to 0.001
`log2(TPM+1)` resolution. The build stores sparse corrections so the default
median grouping remains identical to the unquantized source values.

## Deliberately small data

SurvScope does **not** retain raw TCGA expression matrices. The manual data
workflow streams one GDC-Xena cohort matrix at a time, quantizes each useful
gene row immediately, and writes only:

- compact expression values needed to form custom high/low groups;
- four survival time/event arrays in a stable anonymous order;
- exact median cutoffs and sparse grouping corrections;
- gene/cohort indexes, quality labels, provenance, and checksums.

Raw `.star_tpm.tsv.gz` files are never written to the repository, GitHub
Release, Pages artifact, or Actions cache. Case and sample identifiers are not
included in published assets. See [the data format](docs/data-format.md) for
the on-disk schema.

The source catalog covers the 33 TCGA-CDR cancer types, 18 CPTAC-3 groups, and every uniquely
mapped GENCODE v36 gene symbol present in the corresponding GDC STAR-TPM
matrix. Ambiguous symbol mappings are excluded rather than silently merged.

## Data and software releases

Software and data are versioned independently:

- package/application tags: `v0.1.0`, `v0.2.0`, …
- immutable data tags: `data-v2026.07.28`, …

The website displays its active data version. Refreshes are manual and produce
a new data tag; an existing data release is never replaced silently. Each
GitHub data release contains one plot-only tar archive to avoid API rate limits.
The Pages workflow unpacks it into fine-grained static assets, so the browser
and Python client still fetch only the selected manifest, cohort, and gene
bucket.

To validate the bundled small PAAD regression fixture:

```bash
python scripts/validate_data_release.py \
  --dir web/public/data/2026.07.28 \
  --expected-cohorts 1
```

The production data release is generated only on an ephemeral GitHub runner:

```bash
gh workflow run data-release.yml \
  -f data_version=2026.09.18 \
  -f cohorts=all \
  -f include_cptac=true \
  -f tcga_data_version=2026.07.28
```

This reuses the verified compact TCGA assets byte for byte and streams the
CPTAC cohorts. Leave `tcga_data_version` blank to rebuild TCGA from its sources.
The Python default is `2026.09.18`. Pages serves the active release; download
older immutable release archives and use `--data-dir` for archived analyses.

## Development

```bash
python -m pip install -e ".[test]"
pytest

cd web
npm ci
npm test
npm run build
npm run test:e2e
```

Node.js 22 is used by CI. The repository includes a six-gene PAAD fixture for
tests and initial static preview; the Pages deployment workflow replaces it
with the complete validated data release when that release exists.

## Scientific use

SurvScope is research software, not a diagnostic or clinical
decision-making tool. Endpoint quality badges transcribe the use
recommendations in TCGA-CDR Table 3, including cautioned and not-recommended
combinations rather than hiding them.

Please cite:

- Liu J, et al. *An Integrated TCGA Pan-Cancer Clinical Data Resource to Drive
  High-Quality Survival Outcome Analytics.* Cell. 2018.
  <https://doi.org/10.1016/j.cell.2018.02.052>
- The GDC mRNA expression quantification pipeline:
  <https://docs.gdc.cancer.gov/Data/Bioinformatics_Pipelines/Expression_mRNA_Pipeline/>

## License

SurvScope source code is released under the [MIT License](LICENSE). Source
datasets remain subject to their original terms and citations.
