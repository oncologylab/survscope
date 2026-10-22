# Contributing

Setup and checks are in [docs/development.md](docs/development.md). A few rules
apply to every change:

- Python package code lives in `src/survscope/`; keep the CLI thin.
- The browser application in `web/` is a pure static build. Runtime requests
  stay same-origin: no GDC, Xena, analytics, telemetry, or other third-party
  calls.
- Never commit, cache, upload, or release raw TCGA matrices. Data builders
  stream one cohort and emit only the documented compact assets.
- The SRD5A1/PAAD reference statistics and the 6.8-inch figure are a fixed
  contract; `tests/test_reference.py` guards both.
- Data releases are immutable `data-vYYYY.MM.DD` tags. Validate checksums,
  coverage, asset count, and the 850 MiB Pages budget before deploying.
- PyPI publishing uses GitHub OIDC Trusted Publishing. Do not add API-token
  secrets to workflows or repository settings.
