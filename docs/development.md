# Development and releases

This page is for maintainers. Users should read the [README](../README.md) and [user guide](user-guide.md).

## Local setup and checks

You need Python 3.10+ and Node.js 22.

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

- `npm run build` fails on unused imports, variables and parameters.
- The dev site uses a six-gene TCGA-PAAD fixture (`2026.07.28`). The CPTAC fixture is in `tests/fixtures/cptac/2026.09.18`.
- Local browser tests use Chrome. CI uses Playwright Chromium.
- All runtime requests stay same-origin.
- Put build output in the ignored `data-build/` folder. Dated reports to keep go in `docs/`.
- Clean with `git clean -fdX` on the generated paths only (preview with `-ndX`). Run on the whole repo, it also deletes `.venv/` and `web/node_modules/`.
- Dependencies are updated by hand. CI runs `npm audit --audit-level=high`.

## Statistical validation

On Ubuntu 24.04:

```bash
scripts/install_r_reference.sh
python scripts/validate_statistics.py
```

The installer uses `sudo` for R, jsonlite and Matrix, then installs the pinned, checksum-verified R survival source. Elsewhere, install R, jsonlite, Matrix and survival 3.8-13 yourself. Install Node dependencies first. The run writes `data-build/statistical-validation.json` and fails on any error above the [tolerances](methods.md#validation).

Check a full compact release:

```bash
python scripts/validate_statistics.py \
  --data-dir data-build/published-2026.09.18 --data-version 2026.09.18 \
  --genes SRD5A1 TP53 EGFR --output data-build/statistical-validation-full.json
```

Temporary decoded values are deleted after the run. They never go into a release or artifact.

## Compact data and coverage

Never commit, cache, upload or release raw TCGA matrices. Builders stream one cohort and write only the [documented assets](data-format.md).

Release checks: SHA-256 checksums, cohort and gene coverage, array shape, asset count, and the 850 MiB budget.

```bash
python scripts/validate_data_release.py \
  --dir web/public/data/2026.07.28 --expected-cohorts 1
```

Production has 33 TCGA and 18 CPTAC cohorts. The latest release is `data-v2026.09.18`: 869 assets, 818,907,113 bytes. See [CPTAC](cptac.md).

Build data only with the manual workflow. Each refresh needs a new date. Never reuse a tag.

```bash
gh workflow run data-release.yml \
  -f data_version=YYYY.MM.DD -f cohorts=all -f include_cptac=true \
  -f tcga_data_version=2026.07.28
```

This reuses checked TCGA assets and builds CPTAC. Leave `tcga_data_version` blank to rebuild TCGA. The archive and each file are checksum-checked. Full catalogs stay out of git.

## Deployment

Software (`vX.Y.Z`) and data (`data-vYYYY.MM.DD`) have separate versions. Data releases are immutable.

Pages deploys after a passing CI run, a passing data-release run, or a manual dispatch, all on `main`. It then:

1. runs the Python and browser tests,
2. checks the full data release,
3. validates statistics on all cohorts,
4. checks the site is at most 891,289,600 bytes (850 MiB).

Pages uses the newest data release unless one is named, and builds it in as `VITE_DATA_VERSION`. It serves only that release. For an old release, unpack its archive and pass `--data-version` and `--data-dir`.

## Python package releases

Build with `python -m build`. Check with `python -m twine check dist/*`.

A GitHub release `vX.Y.Z` runs [`publish.yml`](../.github/workflows/publish.yml). It tests, builds the wheel and sdist, and uploads to PyPI with GitHub OIDC Trusted Publishing. No API token is stored anywhere.

PyPI [publishing settings](https://pypi.org/manage/project/survscope/settings/publishing/):

| Field | Value |
| --- | --- |
| GitHub owner | `oncologylab` |
| Repository | `survscope` |
| Workflow filename | `publish.yml` |
| Environment | `pypi` |

To test without uploading, run `gh workflow run publish.yml --ref main`. `invalid-publisher` means a field does not match, or the publisher is on TestPyPI. See [PyPI troubleshooting](https://docs.pypi.org/trusted-publishers/troubleshooting/).

PyPI never accepts the same version twice. Fix a bad release with a new version.

## Editor and project format

- Positions are normalized. Sizes are in inches. Text offsets are in points.
- Fonts are bundled ([fonts](fonts.md)). SVG and PNG embed them. PDF uses the same TTF files.
- A drag is one undo step.

Projects (`format: "survscope-project"`, `version: 2`) hold the software version, a result snapshot, settings, rich text, per-object font, position, lock and visibility, and a citation snapshot. Presets (`format: "survscope-preset"`) hold style only. Neither has matrix rows or patient IDs.

Import rejects unknown versions, bad sizes, mismatched counts, unsafe property names and curve position overrides. Version 1 projects still open. Text is drawn as SVG and never stored as HTML. A project is editable, so it does not prove its data are real.

Analysis JSON is described in [data format](data-format.md#groupings-and-figure-projects).

### Browser and interaction validation

Run other browsers from `web/` after installing them:

```bash
BROWSER=firefox npm run test:e2e
BROWSER=webkit npm run test:e2e
```

Tests use viewports from phone to 4K, plus 200% zoom.

`web/scripts/editor-benchmark.mjs` times 120-step drags (TP53/BRCA, all overlays, 100 notes) in a production build. Run it alone on a full-catalog preview.

| Target | Normal | 4× CPU slowdown |
| --- | ---: | ---: |
| Median p95 frame time | ≤ 20 ms | ≤ 33 ms |
| Long tasks | ≤ 100 ms | ≤ 100 ms |

The [September 21 report](editor-performance-2026.09.21.json) measured 16.7 ms and 16.8 ms, with a longest task of 64 ms.
