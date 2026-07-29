# Repository guidance

- Python package code lives in `src/survscope/`; keep the CLI thin.
- The browser application lives in `web/` and must remain a pure static build.
- Browser runtime requests must be same-origin. Do not add GDC, Xena, analytics,
  telemetry, or other third-party runtime calls.
- Never commit, cache, upload, or release raw TCGA matrices. Data builders must
  stream one cohort and emit only the compact documented assets.
- Preserve the SRD5A1/PAAD golden statistical and 6.8-inch figure contract.
- Use immutable `data-vYYYY.MM.DD` releases and validate checksums, coverage,
  asset count, and the 850 MiB Pages budget before deployment.
- PyPI publishing uses GitHub OIDC Trusted Publishing. Do not add API-token
  secrets to workflows or repository settings.
