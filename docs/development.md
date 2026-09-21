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

### Keeping the workspace clean

Keep downloaded releases, one-off exports, previews, and validation output in the ignored `data-build/` directory. These files are disposable working copies; keep any report intended as lasting evidence in `docs/` with its date and provenance. The checked-in TCGA/CPTAC fixtures, bundled fonts and licenses, and historical validation reports remain part of the project.

After stopping local previews and tests, inspect generated files with this command from the repository root. Replace `-ndX` with `-fdX` to remove the listed files:

```bash
git clean -ndX -- build/ dist/ site/ .coverage htmlcov/ \
  .pytest_cache/ .ruff_cache/ src/survscope/__pycache__/ \
  tests/__pycache__/ scripts/__pycache__/ web/dist/ web/.vite/ \
  web/test-results/ web/playwright-report/ 'web/*.tsbuildinfo'
```

Review `git clean -ndX -- data-build/` separately, then use `git clean -fdX -- data-build/` when its exports and downloaded data are no longer needed. Published releases can be downloaded again. These commands preserve tracked files and the active `.venv/`, `web/node_modules/`, and editable Python package metadata. Avoid an unscoped `git clean -fdX`, which would remove those development dependencies too.

`npm run build` also checks for unused TypeScript imports, local variables, and parameters.

## Independent statistical validation

On Ubuntu 24.04, install the independently versioned reference package with:

```bash
scripts/install_r_reference.sh
python scripts/validate_statistics.py
```

The installer uses `sudo` for R, jsonlite, and Matrix, then installs the SHA-256-verified upstream R survival source at the pinned revision. Other systems can install R, jsonlite, Matrix, and survival 3.8-13 manually. Node dependencies must already be installed. The regular suite writes `data-build/statistical-validation.json` and exits unsuccessfully on any mismatch beyond the documented tolerances.

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

Software (`v0.4.1`, …) and immutable data (`data-vYYYY.MM.DD`) have independent versions. No data rebuild is required for editor or analysis-software updates.

Pages deployment starts after a successful main-branch CI run, a successful main-branch data-release workflow, or an explicit main-branch dispatch. It checks out that triggering commit, runs Python and browser checks, verifies the full data release, and validates statistics across its deployed cohort catalog. Deployment requires passing tests and a complete built site below **891,289,600 bytes (850 MiB)**. The release archive stays immutable; fonts/editor code count toward the final site budget.

The site serves only the selected release. For archived calculations, extract the immutable GitHub release and pass both `--data-version` and `--data-dir` (or their `DataStore` equivalents). A browser project can reopen its saved aggregate results without fetching archived assets; switching to current data requires **New analysis**.

Build Python distributions with `python -m build` and check them with `python -m twine check dist/*`. Publish tested wheels/source distributions to a new software GitHub release. PyPI uses only GitHub OIDC Trusted Publishing; see [registration and publishing](publishing.md). Do not add API-token secrets.

## Editor and project format

The React/TypeScript editor uses normalized panel/annotation positions and physical dimensions in inches; element text offsets are in points. Seven export font families are bundled with their OFL notices and fetched from the site's own origin. [Font provenance](fonts.md) records the sources; new assets have pinned upstream revisions and SHA-256 checksums. SVG/PNG embed font data; vector PDF registers the same TTF faces. Source notices cover adapted SciPy/NumPy numerical routines and the editor dependencies. Dragging uses temporary SVG transforms and commits one history transaction on release; statistical artwork is memoized separately from selection and viewport state. Icon commands use local SVG paths, accessible button names, and tooltips shown on hover or keyboard focus; tooltip changes do not rerender the plot.

Dependency upgrades are maintained manually. Dependabot version-update configuration is intentionally absent, and GitHub's automatic security-update pull requests are disabled. Keep the CI dependency audit; do not reintroduce bot PRs or branches without a maintainer request.

Project JSON uses `format: "survscope-project"`, `version: 2`, software version, a result snapshot, and validated settings. Presets use `format: "survscope-preset"` and appearance only. There are no matrix rows or patient identifiers. Imports reject unsupported versions, invalid dimensions, inconsistent counts, unsafe property names, and curve position overrides. Version 1 imports retain their appearance and results. Version 2 adds validated text runs (bold/italic/super/sub), per-object fonts/alignment/rotation, lock/visibility flags, and an analysis-provenance/citation snapshot. Custom text is rendered as SVG text; the locally bundled ProseMirror overlay edits only the active object and never stores arbitrary HTML. A project is an editable research artifact, not a signed certificate of data authenticity.

The Python result JSON retains its existing snake_case fields; browser JSON retains camelCase. Both add normalized grouping parameters, lower/upper thresholds, eligible/excluded counts, Cox status, and statistical method version. The browser project format is separate from analysis-only JSON.

### Browser and interaction validation

The default Playwright suite uses Chromium. Run the same suite in Firefox and WebKit with `BROWSER=firefox npm run test:e2e` and `BROWSER=webkit npm run test:e2e` from `web/` after installing those browsers. Viewport coverage includes native 4K, 1080p, laptop/tablet/phone, short windows, and the CSS viewport used at 200% desktop zoom. The suite checks direct rich text editing, layers, object locks, keyboard isolation, citations, project migration, and embedded-font exports.

`web/scripts/editor-benchmark.mjs` measures 120-step drags in a production build using TP53/BRCA, all survival overlays, and 100 annotations. Run it against a local complete-catalog preview, without concurrent tests. It records browser/CPU information and three measured runs at normal and 4× CPU slowdown after warm-up. Targets: median p95 frame time ≤20 ms / ≤33 ms respectively, with interaction long tasks ≤100 ms.

The [September 21 benchmark report](editor-performance-2026.09.21.json) records median p95 frame times of **16.7 ms** at normal speed and **16.8 ms** at 4× slowdown. The longest measured interaction task was **64 ms**. These measurements describe the recorded browser and machine, not a speed guarantee for every device.

Grouping outputs use `percentile_groups`; `extremes` remains an accepted legacy input alias in browser URLs/projects and the Python API/CLI. The numeric grouping algorithm is unchanged. Historical validation reports retain the identifiers used at the time.
