# Contributing

Setup and checks are in [docs/development.md](docs/development.md). Rules for every change:

- Python code lives in `src/survscope/`. Keep the CLI thin.
- `web/` is a static build. Runtime requests stay same-origin: no GDC, Xena, analytics, telemetry or other third-party calls.
- Never commit, cache, upload or release raw TCGA matrices. Builders stream one cohort and write only the documented compact assets.
- The SRD5A1/PAAD reference statistics and the 6.8-inch figure are fixed. `tests/test_reference.py` guards both.
- Data releases are immutable `data-vYYYY.MM.DD` tags. Before deploying, check checksums, coverage, asset count and the 850 MiB Pages budget.
- PyPI publishing uses GitHub OIDC Trusted Publishing. Do not add API-token secrets to workflows or repository settings.
