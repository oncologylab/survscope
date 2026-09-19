#!/usr/bin/env bash
# Pinned independent reference; runtime application has no R dependency.
set -euo pipefail
reference_revision=ed1a6b249fa714ccb9169faea63ddafd1addb774
reference_sha256=e6366fd240aedf94b2b1d3e61e495046dc974c1f2536d8e782a389c56563418b
reference_dir="$(mktemp -d)"
trap 'rm -rf "$reference_dir"' EXIT
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends r-base-core r-cran-jsonlite
curl --fail --location --retry 3 \
  "https://codeload.github.com/therneau/survival/tar.gz/${reference_revision}" \
  --output "$reference_dir/survival.tar.gz"
echo "$reference_sha256  $reference_dir/survival.tar.gz" | sha256sum --check
sudo R CMD INSTALL "$reference_dir/survival.tar.gz"
Rscript -e 'stopifnot(packageVersion("survival") == "3.8.13"); print(sessionInfo())'
