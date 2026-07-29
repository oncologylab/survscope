#!/usr/bin/env python3
"""Validate a SurvScope static data release without loading source TCGA data."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

FORBIDDEN_SUFFIXES = (".tsv", ".tsv.gz", ".h5", ".hdf5", ".bam", ".cram")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", required=True, type=Path)
    parser.add_argument("--expected-cohorts", type=int, default=None)
    parser.add_argument("--max-bytes", type=int, default=850 * 1024 * 1024)
    parser.add_argument("--max-assets", type=int, default=999)
    return parser.parse_args()


def fail(message: str) -> None:
    raise RuntimeError(message)


def main() -> int:
    args = parse_args()
    manifests = list(args.dir.glob("manifest-*.json"))
    if len(manifests) != 1:
        fail(f"Expected one manifest, found {len(manifests)}")
    manifest = json.loads(manifests[0].read_text())
    if manifest.get("schema_version") != 1:
        fail("Unsupported or missing schema version")
    cohorts = manifest.get("cohorts", {})
    if args.expected_cohorts is not None and len(cohorts) != args.expected_cohorts:
        fail(f"Expected {args.expected_cohorts} cohorts, found {len(cohorts)}")
    files = [path for path in args.dir.iterdir() if path.is_file()]
    if len(files) > args.max_assets:
        fail(f"Release has {len(files)} assets; limit is {args.max_assets}")
    total_bytes = sum(path.stat().st_size for path in files)
    if total_bytes > args.max_bytes:
        fail(f"Release is {total_bytes} bytes; limit is {args.max_bytes}")
    forbidden = [path.name for path in files if path.name.lower().endswith(FORBIDDEN_SUFFIXES)]
    if forbidden:
        fail(f"Raw/source data files are forbidden: {', '.join(forbidden)}")

    for name, expected in manifest.get("assets", {}).items():
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
    for code, cohort in cohorts.items():
        clinical_path = args.dir / cohort["clinical_asset"]
        clinical = json.loads(clinical_path.read_text())
        if clinical.get("identifiers_included") is not False:
            fail(f"{code}: clinical asset must omit case/sample identifiers")
        if set(clinical.get("endpoints", {})) != {"OS", "DSS", "PFI", "DFI"}:
            fail(f"{code}: endpoint set is incomplete")
        sample_count = clinical.get("sample_count")
        for endpoint, values in clinical["endpoints"].items():
            if len(values["time"]) != sample_count or len(values["event"]) != sample_count:
                fail(f"{code} {endpoint}: clinical array length mismatch")
        for bucket, asset in cohort["bucket_assets"].items():
            with zipfile.ZipFile(args.dir / asset) as archive:
                if set(archive.namelist()) != {"meta.json", "expression.u16le"}:
                    fail(f"{code} bucket {bucket}: unexpected ZIP members")
                meta = json.loads(archive.read("meta.json"))
                expected_bytes = len(meta["genes"]) * sample_count * 2
                if len(archive.read("expression.u16le")) != expected_bytes:
                    fail(f"{code} bucket {bucket}: expression matrix size mismatch")

    print(
        json.dumps(
            {
                "data_version": manifest["data_version"],
                "cohorts": len(cohorts),
                "genes": gene_count,
                "assets": len(files),
                "bytes": total_bytes,
                "status": "PASS",
            }
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
