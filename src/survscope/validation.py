#!/usr/bin/env python3
"""Validate a SurvScope static data release without loading source TCGA data."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import zipfile
from pathlib import Path

FORBIDDEN_SUFFIXES = (".tsv", ".tsv.gz", ".h5", ".hdf5", ".bam", ".cram")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", required=True, type=Path)
    parser.add_argument("--expected-cohorts", type=int, default=None)
    parser.add_argument("--required-cohorts", nargs="+", default=[])
    parser.add_argument("--max-bytes", type=int, default=850 * 1024 * 1024)
    parser.add_argument("--max-assets", type=int, default=999)
    return parser.parse_args(argv)


def fail(message: str) -> None:
    raise RuntimeError(message)


def validate_release(
    directory: Path, *, expected_cohorts: int | None = None,
    required_cohorts: tuple[str, ...] | list[str] = (),
    max_bytes: int = 850 * 1024 * 1024, max_assets: int = 999,
) -> dict:
    """Validate compact release integrity and return its manifest."""
    args = argparse.Namespace(dir=directory, expected_cohorts=expected_cohorts,
                              required_cohorts=required_cohorts,
                              max_bytes=max_bytes, max_assets=max_assets)
    manifests = list(args.dir.glob("manifest-*.json"))
    if len(manifests) != 1:
        fail(f"Expected one manifest, found {len(manifests)}")
    manifest = json.loads(manifests[0].read_text())
    if manifest.get("schema_version") not in {1, 2}:
        fail("Unsupported or missing schema version")
    cohorts = manifest.get("cohorts", {})
    if not cohorts or not set(args.required_cohorts).issubset(cohorts):
        fail("Required cohort coverage is incomplete")
    if "requested_cohorts" in manifest and set(manifest["requested_cohorts"]) != set(cohorts):
        fail("Requested cohort coverage is incomplete")
    if args.expected_cohorts is not None and len(cohorts) != args.expected_cohorts:
        fail(f"Expected {args.expected_cohorts} cohorts, found {len(cohorts)}")
    files = [path for path in args.dir.iterdir() if path.is_file()]
    if any(path.is_dir() or path.is_symlink() for path in args.dir.iterdir()):
        fail("Release assets must be regular files in one flat directory")
    if len(files) > args.max_assets:
        fail(f"Release has {len(files)} assets; limit is {args.max_assets}")
    total_bytes = sum(path.stat().st_size for path in files)
    if total_bytes > args.max_bytes:
        fail(f"Release is {total_bytes} bytes; limit is {args.max_bytes}")
    forbidden = [path.name for path in files if path.name.lower().endswith(FORBIDDEN_SUFFIXES)]
    if forbidden:
        fail(f"Raw/source data files are forbidden: {', '.join(forbidden)}")

    assets = manifest.get("assets", {})
    names = {path.name for path in files}
    if names != set(assets) | {manifests[0].name, "SHA256SUMS"}:
        fail("Release contains unlisted or missing assets")
    sums = {}
    for line in (args.dir / "SHA256SUMS").read_text().splitlines():
        digest, name = line.split("  ", 1)
        if name in sums or name not in names:
            fail("Unexpected or duplicate SHA256SUMS entry")
        sums[name] = digest
    if set(sums) != names - {"SHA256SUMS"}:
        fail("SHA256SUMS coverage is incomplete")
    for name, digest in sums.items():
        if hashlib.sha256((args.dir / name).read_bytes()).hexdigest() != digest:
            fail(f"SHA256SUMS mismatch: {name}")

    for name, expected in assets.items():
        path = args.dir / name
        if not path.is_file():
            fail(f"Missing declared asset: {name}")
        payload = path.read_bytes()
        if len(payload) != expected["bytes"]:
            fail(f"Size mismatch: {name}")
        if hashlib.sha256(payload).hexdigest() != expected["sha256"]:
            fail(f"SHA-256 mismatch: {name}")

    gene_count = len(manifest.get("genes", []))
    if gene_count == 0:
        fail("Gene catalog is empty")
    used_assets = set()
    for gene in manifest["genes"]:
        if not gene["cohorts"] or not set(gene["cohorts"]).issubset(cohorts):
            fail("Gene references missing or unsupported cohorts")
    for code, cohort in cohorts.items():
        if cohort["clinical_asset"] not in assets:
            fail(f"{code}: clinical asset lacks a checksum")
        used_assets.add(cohort["clinical_asset"])
        clinical_path = args.dir / cohort["clinical_asset"]
        clinical = json.loads(clinical_path.read_text())
        if clinical.get("identifiers_included") is not False:
            fail(f"{code}: clinical asset must omit case/sample identifiers")
        if set(clinical.get("endpoints", {})) != {"OS", "DSS", "PFI", "DFI"}:
            fail(f"{code}: endpoint set is incomplete")
        sample_count = clinical.get("sample_count")
        if sample_count != cohort["sample_count"] or sample_count <= 0:
            fail(f"{code}: invalid sample count")
        if clinical.get("cohort") != code:
            fail(f"{code}: clinical cohort mismatch")
        if cohort.get("program") == "CPTAC":
            if manifest["schema_version"] != 2:
                fail(f"{code}: CPTAC requires a program-aware schema-2 manifest")
            if cohort.get("available_endpoints") != ["OS"]:
                fail(f"{code}: CPTAC GDC supports OS only")
            if cohort.get("coverage", {}).get("matched_cases") != sample_count:
                fail(f"{code}: CPTAC matched-case coverage mismatch")
            if cohort.get("sources", {}).get("survival", {}).get("time_unit") != "days":
                fail(f"{code}: CPTAC survival must use days")
            if any(clinical["endpoints"][ep].get("quality") != "unavailable"
                   for ep in ("DSS", "PFI", "DFI")):
                fail(f"{code}: unsupported CPTAC endpoints must be unavailable")
        for endpoint, values in clinical["endpoints"].items():
            if len(values["time"]) != sample_count or len(values["event"]) != sample_count:
                fail(f"{code} {endpoint}: clinical array length mismatch")
            if any(event is not None and event not in (0, 1) for event in values["event"]):
                fail(f"{code} {endpoint}: events must be binary or null")
            if any(value is not None and not math.isfinite(value) for value in values["time"]):
                fail(f"{code} {endpoint}: times must be finite or null")
            if cohort.get("program") == "CPTAC" and values.get("quality") == "unavailable" and any(
                value is not None for value in [*values["time"], *values["event"]]
            ):
                fail(f"{code} {endpoint}: unavailable endpoint contains observations")
        expected_genes = {
            (gene["symbol"].upper(), gene["ensembl"], gene["bucket"])
            for gene in manifest["genes"] if code in gene["cohorts"]
        }
        actual_genes = set()
        for bucket, asset in cohort["bucket_assets"].items():
            if asset not in assets:
                fail(f"{code}: expression asset lacks a checksum")
            used_assets.add(asset)
            with zipfile.ZipFile(args.dir / asset) as archive:
                if set(archive.namelist()) != {"meta.json", "expression.u16le"}:
                    fail(f"{code} bucket {bucket}: unexpected ZIP members")
                meta = json.loads(archive.read("meta.json"))
                if meta["cohort"] != code or meta["sample_count"] != sample_count:
                    fail(f"{code} bucket {bucket}: metadata mismatch")
                for row, gene in enumerate(meta["genes"]):
                    key = (gene["symbol"].upper(), gene["ensembl"], bucket)
                    if gene["row"] != row or key in actual_genes:
                        fail(f"{code} bucket {bucket}: duplicate or misordered gene")
                    actual_genes.add(key)
                    for median in gene["medians"].values():
                        if any(not isinstance(index, int) or not 0 <= index < sample_count
                               for index in median["flips"]):
                            fail(f"{code} bucket {bucket}: invalid median corrections")
                expected_bytes = len(meta["genes"]) * sample_count * 2
                if len(archive.read("expression.u16le")) != expected_bytes:
                    fail(f"{code} bucket {bucket}: expression matrix size mismatch")
        if actual_genes != expected_genes or len(actual_genes) != cohort["gene_count"]:
            fail(f"{code}: gene coverage mismatch")
    if used_assets != set(assets):
        fail("Release has unreferenced assets")

    return manifest


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    manifest = validate_release(
        args.dir, expected_cohorts=args.expected_cohorts,
        required_cohorts=args.required_cohorts, max_bytes=args.max_bytes,
        max_assets=args.max_assets,
    )
    files = list(args.dir.iterdir())
    print(json.dumps({
        "data_version": manifest["data_version"], "cohorts": len(manifest["cohorts"]),
        "genes": len(manifest["genes"]), "assets": len(files),
        "bytes": sum(path.stat().st_size for path in files), "status": "PASS",
    }))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
