# Development and releases

The [README](../README.md) and [user guide](user-guide.md) introduce SurvScope for users. This page covers maintaining the software and compact data releases.

## Local setup and checks

Use Python 3.10 or later and Node.js 22. The browser is a pure static build.

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

Keep downloaded releases, exports, previews, and validation output in the ignored `data-build/` directory; reports meant as lasting evidence go in `docs/` with their date and provenance. To remove build and test output, use `git clean -fdX` scoped to the generated paths (preview with `-ndX` first); an unscoped run would also delete `.venv/` and `web/node_modules/`.

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

Generate data only through the manual data-release workflow on an ephemeral runner. Use a new version for each refresh; never reuse an existing release tag. For example, substitute a new date in:

```bash
gh workflow run data-release.yml \
  -f data_version=YYYY.MM.DD -f cohorts=all -f include_cptac=true \
  -f tcga_data_version=2026.07.28
```

This reuses checksummed compact TCGA assets and builds CPTAC. Leave `tcga_data_version` blank to rebuild TCGA from its sources. The archive checksum is verified before extraction; each extracted asset is then verified independently. The complete catalog is kept out of source control.

## Deployment

Software (`vX.Y.Z`) and immutable data (`data-vYYYY.MM.DD`) have independent versions. No data rebuild is required for editor or analysis-software updates.

Pages deployment starts after a successful main-branch CI run, a successful main-branch data-release workflow, or an explicit main-branch dispatch. It checks out that triggering commit, runs Python and browser checks, verifies the full data release, and validates statistics across its deployed cohort catalog. Deployment requires passing tests and a complete built site of at most 891,289,600 bytes (850 MiB). The release archive stays immutable; fonts/editor code count toward the final site budget.

The site serves only the selected release. For archived calculations, extract the immutable GitHub release and pass both `--data-version` and `--data-dir` (or their `DataStore` equivalents). A browser project can reopen its saved aggregate results without fetching archived assets; switching to current data requires **New analysis**.

## Python package releases

Build distributions with `python -m build` and check them with `python -m twine check dist/*`. Publishing a GitHub release named `vX.Y.Z` runs [`publish.yml`](../.github/workflows/publish.yml): the build job runs the tests, builds the wheel and source distribution, and checks their metadata; the publish job uploads them to PyPI with GitHub OIDC Trusted Publishing. No API token is stored in the workflow or repository settings.

The PyPI project registers this publisher in its [publishing settings](https://pypi.org/manage/project/survscope/settings/publishing/):

| Field | Value |
| --- | --- |
| GitHub owner | `oncologylab` |
| Repository | `survscope` |
| Workflow filename | `publish.yml` |
| Environment | `pypi` |

To check the registration without uploading anything, run `gh workflow run publish.yml --ref main`. The **Verify PyPI Trusted Publisher** job exchanges the GitHub identity for a short-lived PyPI credential and discards it. An `invalid-publisher` error means one of the fields above does not match, or the publisher was registered on TestPyPI; see [PyPI's troubleshooting guide](https://docs.pypi.org/trusted-publishers/troubleshooting/).

PyPI does not accept a second upload of an existing version. Fix a failed release with a new `vX.Y.Z` version rather than replacing published files.

## Editor and project format

The React/TypeScript editor uses normalized panel/annotation positions and physical dimensions in inches; element text offsets are in points. Seven export font families are bundled with their OFL notices and fetched from the site's own origin. [Font provenance](fonts.md) records the sources, pinned upstream revisions, and SHA-256 checksums. SVG/PNG embed font data; vector PDF registers the same TTF faces. Source notices cover adapted SciPy/NumPy numerical routines and the editor dependencies. Dragging uses temporary SVG transforms and commits one history transaction on release. Icon commands use local SVG paths with accessible button names.

Dependencies are updated by hand; CI runs `npm audit --audit-level=high`.

Project JSON uses `format: "survscope-project"`, `version: 2`, software version, a result snapshot, and validated settings. Presets use `format: "survscope-preset"` and appearance only. There are no matrix rows or patient identifiers. Imports reject unsupported versions, invalid dimensions, inconsistent counts, unsafe property names, and curve position overrides. Version 1 projects import with their appearance and results. Version 2 contains validated text runs (bold/italic/super/sub), per-object fonts/alignment/rotation, lock/visibility flags, and an analysis-provenance/citation snapshot. Custom text is rendered as SVG text; the locally bundled ProseMirror overlay edits only the active object and never stores arbitrary HTML. A project is an editable research artifact, not a signed certificate of data authenticity.

Analysis-only JSON is separate from the project format; its fields are described in [data format](data-format.md#groupings-and-figure-projects).

### Browser and interaction validation

The default Playwright suite uses Chromium. Run the same suite in Firefox and WebKit with `BROWSER=firefox npm run test:e2e` and `BROWSER=webkit npm run test:e2e` from `web/` after installing those browsers. Viewport coverage includes native 4K, 1080p, laptop/tablet/phone, short windows, and the CSS viewport used at 200% desktop zoom. The suite checks direct rich text editing, layers, object locks, keyboard isolation, citations, project migration, and embedded-font exports.

`web/scripts/editor-benchmark.mjs` measures 120-step drags in a production build using TP53/BRCA, all survival overlays, and 100 annotations. Run it against a local complete-catalog preview, without concurrent tests. It records browser/CPU information and three measured runs at normal and 4× CPU slowdown after warm-up. Targets: median p95 frame time ≤20 ms / ≤33 ms respectively, with interaction long tasks ≤100 ms.

The [September 21 benchmark report](editor-performance-2026.09.21.json) records median p95 frame times of 16.7 ms at normal speed and 16.8 ms at 4× slowdown, and a longest interaction task of 64 ms, on the browser and machine it lists.
