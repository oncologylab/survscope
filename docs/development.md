# Development and releases

The [README](../README.md) and [user guide](user-guide.md) introduce SurvScope for users. This page covers maintaining the software and compact data releases.

## Local setup and checks

Use Python 3.10 or later and Node.js 22. The browser remains a pure static build.

```bash
python -m pip install -e ".[test]"
ruff check .
pytest
cd web
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run dev
```

The local development site includes a six-gene TCGA-PAAD fixture (`2026.07.28`). The separate CPTAC fixture is under `tests/fixtures/cptac/2026.09.18`; integration tests serve both from the test site's origin. A local browser test uses installed Chrome; CI uses Playwright Chromium. All runtime requests, including fonts and data, must remain same-origin.

## Independent statistical validation

On Ubuntu 24.04, install the independently versioned reference package with:

```bash
scripts/install_r_reference.sh
python scripts/validate_statistics.py
```

The installer uses `sudo` for R and jsonlite, then installs the SHA-256-verified upstream R survival source at the pinned revision. Other systems can install R, jsonlite, and survival 3.8-13 manually. Node dependencies must already be installed. The regular suite writes `data-build/statistical-validation.json` and exits unsuccessfully on any mismatch beyond the documented tolerances.

Validate a complete compact release, without obtaining raw source matrices:

```bash
python scripts/validate_statistics.py \
  --data-dir data-build/published-2026.09.18 --data-version 2026.09.18 \
  --genes SRD5A1 TP53 EGFR --output data-build/statistical-validation-full.json
```

Reports include runtime versions, source hashes, grouping definitions, coverage, and maximum errors. R output is streamed during the full-catalog check. Temporary decoded validation vectors are removed on completion and are never part of a release or Actions artifact. See [methods](methods.md#validation) for exact semantics and limitations.

## Compact data and coverage

Raw TCGA matrices must never be committed, cached, uploaded, or released. Builders stream one cohort, quantize immediately, and write only documented compact assets. Asset validation checks SHA-256 checksums, cohort/gene coverage, array shape, file count, and the 850 MiB budget. Anonymous expression rows in validated compact assets are permitted; raw source matrices are not.

```bash
python scripts/validate_data_release.py \
  --dir web/public/data/2026.07.28 --expected-cohorts 1
```

Production uses 33 TCGA cohorts and 18 CPTAC groups. The latest data release is `data-v2026.09.18`; it contains 869 assets and 818,907,113 bytes. See [CPTAC coverage and source research](cptac.md), and [data format](data-format.md).

Generate data only through the manual data-release workflow on an ephemeral runner. Use a **new** version for each refresh; never reuse an existing release tag. For example, substitute a new date in:

```bash
gh workflow run data-release.yml \
  -f data_version=YYYY.MM.DD -f cohorts=all -f include_cptac=true \
  -f tcga_data_version=2026.07.28
```

This reuses checksummed compact TCGA assets and builds CPTAC. Leave `tcga_data_version` blank to rebuild TCGA from its sources. The archive checksum is verified before extraction; each extracted asset is then verified independently. The complete catalog is kept out of source control.

## Deployment and software publishing

Software (`v0.3.0`, …) and immutable data (`data-vYYYY.MM.DD`) have independent versions. No data rebuild is required for editor or analysis-software updates.

Pages deployment starts after a successful main-branch CI run, a successful main-branch data-release workflow, or an explicit main-branch dispatch. It checks out that triggering commit, runs Python and browser checks, verifies the full data release, and validates statistics across its deployed cohort catalog. Deployment requires passing tests and a complete built site below **891,289,600 bytes (850 MiB)**. The release archive stays immutable; fonts/editor code count toward the final site budget.

The site serves only the selected release. For archived calculations, extract the immutable GitHub release and pass both `--data-version` and `--data-dir` (or their `DataStore` equivalents). A browser project can reopen its saved aggregate results without fetching archived assets; switching to current data requires **New analysis**.

Build Python distributions with `python -m build` and check them with `python -m twine check dist/*`. Publish tested wheels/source distributions to a new software GitHub release. PyPI uses only GitHub OIDC Trusted Publishing; see [registration and publishing](publishing.md). Do not add API-token secrets.

## Editor and project format

The React/TypeScript editor uses normalized panel/annotation positions and physical dimensions in inches; element text offsets are in points. Export fonts are bundled Liberation Sans/Serif/Mono with their OFL notice, and fetched from the site's own origin. SVG/PNG embed font data; vector PDF registers the same TTF faces. Source notices cover adapted SciPy/NumPy numerical routines.

Project JSON uses `format: "survscope-project"`, `version: 1`, software version, a result snapshot, and validated settings. Presets use `format: "survscope-preset"` and appearance only. There are no matrix rows or patient identifiers. Imports reject unsupported versions, invalid dimensions, inconsistent counts, unsafe property names, and curve position overrides. Custom text is rendered as text, never HTML. A project is an editable research artifact, not a signed certificate of data authenticity.

The Python result JSON retains its existing snake_case fields; browser JSON retains camelCase. Both add normalized grouping parameters, lower/upper thresholds, eligible/excluded counts, Cox status, and statistical method version. The browser project format is separate from analysis-only JSON.
