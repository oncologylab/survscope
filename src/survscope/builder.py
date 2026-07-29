"""Streaming builder for compact, versioned SurvScope static data assets."""

from __future__ import annotations

import argparse
import contextlib
import csv
import gzip
import hashlib
import io
import json
import math
import tempfile
import urllib.request
import zipfile
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO

import numpy as np

from .constants import (
    BUCKET_COUNT,
    COHORT_LABELS,
    COHORT_PRIMARY_SAMPLE_CODES,
    COHORTS,
    DEFAULT_DATA_VERSION,
    DEFAULT_PRIMARY_SAMPLE_CODES,
    ENDPOINT_COLUMNS,
    ENDPOINTS,
    EXPRESSION_SCALE,
    GDC_EXPRESSION_URL,
    GDC_PIPELINE_URL,
    GDC_PROBEMAP_URL,
    GDC_SAMPLE_TYPE_CODES_URL,
    MISSING_EXPRESSION,
    SAMPLE_TYPE_LABELS,
    SCHEMA_VERSION,
    TCGA_CDR_CITATION_URL,
    TCGA_CDR_URL,
)
from .quality import endpoint_quality


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n").encode()


def _parse_number(value: str) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _sample_case(sample: str) -> str:
    return sample[:15]


def _sample_type_code(sample: str) -> str | None:
    parts = sample.split("-")
    return parts[3][:2] if len(parts) >= 4 and len(parts[3]) >= 2 else None


def _primary_sample_codes(cohort: str) -> tuple[str, ...]:
    return COHORT_PRIMARY_SAMPLE_CODES.get(cohort.upper(), DEFAULT_PRIMARY_SAMPLE_CODES)


def _is_primary_cancer_sample(sample: str, cohort: str) -> bool:
    return _sample_type_code(sample) in _primary_sample_codes(cohort)


def _bucket_for(symbol: str) -> str:
    value = hashlib.sha256(symbol.upper().encode()).digest()[0] % BUCKET_COUNT
    return f"{value:02x}"


class HashingReader:
    """Binary reader that hashes source bytes as they stream past."""

    def __init__(self, source: BinaryIO) -> None:
        self.source = source
        self.sha256 = hashlib.sha256()
        self.byte_count = 0

    def read(self, size: int = -1) -> bytes:
        payload = self.source.read(size)
        self.sha256.update(payload)
        self.byte_count += len(payload)
        return payload

    def readinto(self, target) -> int:
        payload = self.read(len(target))
        target[: len(payload)] = payload
        return len(payload)

    def readable(self) -> bool:
        return True

    def close(self) -> None:
        self.source.close()


@dataclass(frozen=True)
class SourceText:
    text: str
    url: str
    sha256: str
    byte_count: int


def _read_small_source(url_or_path: str, public_url: str | None = None) -> SourceText:
    path = Path(url_or_path)
    if path.is_file():
        payload = path.read_bytes()
        url = public_url or str(path.resolve())
    else:
        request = urllib.request.Request(url_or_path, headers={"User-Agent": "survscope/0.1"})
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read()
        url = public_url or url_or_path
    return SourceText(
        text=payload.decode(),
        url=url,
        sha256=hashlib.sha256(payload).hexdigest(),
        byte_count=len(payload),
    )


def load_probemap(source: SourceText) -> tuple[dict[str, tuple[str, str]], int]:
    """Return mappings only for symbols associated with exactly one Ensembl gene."""
    reader = csv.DictReader(io.StringIO(source.text), delimiter="\t")
    records = []
    symbols = Counter()
    for row in reader:
        ensembl_version = row["id"].strip()
        symbol = row["gene"].strip()
        if not ensembl_version or not symbol:
            continue
        ensembl = ensembl_version.split(".", 1)[0]
        symbol_key = symbol.upper()
        records.append((ensembl_version, ensembl, symbol, symbol_key))
        symbols[symbol_key] += 1
    ambiguous = {symbol for symbol, count in symbols.items() if count != 1}
    mapping: dict[str, tuple[str, str]] = {}
    for ensembl_version, ensembl, symbol, symbol_key in records:
        if symbol_key in ambiguous:
            continue
        mapping[ensembl_version] = (symbol, ensembl)
        mapping.setdefault(ensembl, (symbol, ensembl))
    return mapping, len(ambiguous)


def load_survival(source: SourceText) -> dict[str, dict[str, dict[str, float | None]]]:
    result: dict[str, dict[str, dict[str, float | None]]] = {}
    reader = csv.DictReader(io.StringIO(source.text), delimiter="\t")
    for row in reader:
        cohort = row["cancer type abbreviation"].strip().upper()
        sample = row["sample"].strip()
        if not cohort or not sample:
            continue
        endpoint_values = {}
        for endpoint, (time_column, event_column) in ENDPOINT_COLUMNS.items():
            endpoint_values[endpoint] = {
                "time": _parse_number(row.get(time_column, "")),
                "event": _parse_number(row.get(event_column, "")),
            }
        result.setdefault(cohort, {})[sample] = endpoint_values
    return result


@contextlib.contextmanager
def _expression_stream(source: str) -> Any:
    """Yield a decompressed text stream and its source-byte hasher."""
    path = Path(source)
    if path.is_file():
        raw: BinaryIO = path.open("rb")
        label = str(path.resolve())
    else:
        request = urllib.request.Request(source, headers={"User-Agent": "survscope/0.1"})
        raw = urllib.request.urlopen(request, timeout=180)
        label = source
    hashing = HashingReader(raw)
    compressed = gzip.GzipFile(fileobj=hashing, mode="rb")
    text = io.TextIOWrapper(compressed, encoding="utf-8", newline="")
    try:
        yield text, hashing, label
    finally:
        text.close()


def _clinical_asset(
    cohort: str,
    sample_cases: list[str],
    survival_rows: dict[str, dict[str, dict[str, float | None]]],
) -> dict[str, Any]:
    sample_codes = _primary_sample_codes(cohort)
    sample_labels = [SAMPLE_TYPE_LABELS[code] for code in sample_codes]
    endpoints = {}
    for endpoint in ENDPOINTS:
        quality, note = endpoint_quality(cohort, endpoint)
        endpoints[endpoint] = {
            "time": [survival_rows[sample][endpoint]["time"] for sample in sample_cases],
            "event": [survival_rows[sample][endpoint]["event"] for sample in sample_cases],
            "quality": quality,
            "quality_note": note,
        }
    return {
        "schema_version": SCHEMA_VERSION,
        "cohort": cohort,
        "sample_count": len(sample_cases),
        "sample_type": " / ".join(sample_labels),
        "sample_type_codes": list(sample_codes),
        "identifiers_included": False,
        "endpoints": endpoints,
    }


def _median_metadata(
    expression_log2: np.ndarray,
    encoded: np.ndarray,
    clinical: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    exact_tpm = np.exp2(expression_log2) - 1.0
    decoded_log2 = encoded.astype(float) / EXPRESSION_SCALE
    decoded_log2[encoded == MISSING_EXPRESSION] = np.nan
    decoded_tpm = np.exp2(decoded_log2) - 1.0
    metadata = {}
    for endpoint in ENDPOINTS:
        time = np.asarray(
            [
                np.nan if value is None else value
                for value in clinical["endpoints"][endpoint]["time"]
            ],
            dtype=float,
        )
        event = np.asarray(
            [
                np.nan if value is None else value
                for value in clinical["endpoints"][endpoint]["event"]
            ],
            dtype=float,
        )
        valid = (
            np.isfinite(exact_tpm) & np.isfinite(time) & np.isfinite(event) & (time > 0)
        )
        if not np.any(valid):
            metadata[endpoint] = {"cutoff_tpm": None, "flips": []}
            continue
        cutoff = float(np.median(exact_tpm[valid]))
        exact_high = exact_tpm > cutoff
        encoded_high = decoded_tpm > cutoff
        flips = np.flatnonzero(valid & (exact_high != encoded_high)).astype(int).tolist()
        metadata[endpoint] = {"cutoff_tpm": cutoff, "flips": flips}
    return metadata


def build_cohort(
    cohort: str,
    *,
    expression_source: str,
    survival: dict[str, dict[str, dict[str, float | None]]],
    probemap: dict[str, tuple[str, str]],
    outdir: Path,
    wanted_genes: set[str] | None = None,
    expression_public_url: str | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Stream one cohort and emit only compact plot data assets."""
    cohort = cohort.upper()
    survival_rows = survival.get(cohort)
    if not survival_rows:
        raise RuntimeError(f"No TCGA-CDR rows found for {cohort}")
    outdir.mkdir(parents=True, exist_ok=True)
    bucket_ids = [f"{index:02x}" for index in range(BUCKET_COUNT)]
    bucket_metadata: dict[str, list[dict[str, Any]]] = {key: [] for key in bucket_ids}
    genes: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory(prefix=f"survscope-{cohort.lower()}-") as temp_name:
        temporary = Path(temp_name)
        raw_paths = {key: temporary / f"{cohort}-bucket-{key}.u16le" for key in bucket_ids}
        handles = {key: path.open("wb") for key, path in raw_paths.items()}
        try:
            with _expression_stream(expression_source) as (text, source_hash, source_label):
                reader = csv.reader(text, delimiter="\t")
                header = next(reader)
                selected: list[tuple[int, str]] = []
                seen_cases = set()
                for index, sample in enumerate(header[1:]):
                    case = _sample_case(sample)
                    if (
                        _is_primary_cancer_sample(sample, cohort)
                        and case in survival_rows
                        and case not in seen_cases
                    ):
                        selected.append((index, case))
                        seen_cases.add(case)
                if not selected:
                    codes = ", ".join(_primary_sample_codes(cohort))
                    raise RuntimeError(
                        f"No matched primary cancer samples found for {cohort} "
                        f"(TCGA sample codes: {codes})"
                    )
                selected_indices = [index for index, _ in selected]
                sample_cases = [case for _, case in selected]
                clinical = _clinical_asset(cohort, sample_cases, survival_rows)
                processed_rows = 0
                included_rows = 0
                for row in reader:
                    processed_rows += 1
                    if not row:
                        continue
                    identifier = row[0].strip()
                    mapped = probemap.get(identifier) or probemap.get(
                        identifier.split(".", 1)[0]
                    )
                    if mapped is None:
                        continue
                    symbol, ensembl = mapped
                    if wanted_genes and symbol.upper() not in wanted_genes:
                        continue
                    values = np.asarray(
                        [
                            float(row[index + 1]) if row[index + 1] else np.nan
                            for index in selected_indices
                        ],
                        dtype=float,
                    )
                    encoded = np.full(len(values), MISSING_EXPRESSION, dtype="<u2")
                    finite = np.isfinite(values)
                    quantized = np.rint(values[finite] * EXPRESSION_SCALE)
                    quantized = np.clip(quantized, 0, MISSING_EXPRESSION - 1)
                    encoded[finite] = quantized.astype("<u2")
                    bucket = _bucket_for(symbol)
                    row_index = len(bucket_metadata[bucket])
                    handles[bucket].write(encoded.tobytes())
                    record = {
                        "symbol": symbol,
                        "ensembl": ensembl,
                        "row": row_index,
                        "medians": _median_metadata(values, encoded, clinical),
                    }
                    bucket_metadata[bucket].append(record)
                    genes.append(
                        {
                            "symbol": symbol,
                            "ensembl": ensembl,
                            "bucket": bucket,
                        }
                    )
                    included_rows += 1
                    if processed_rows % 5000 == 0:
                        print(
                            f"{cohort}: streamed {processed_rows:,} source rows; "
                            f"kept {included_rows:,}",
                            flush=True,
                        )
                source_details = {
                    "url": expression_public_url or source_label,
                    "sha256": source_hash.sha256.hexdigest(),
                    "compressed_bytes_streamed": source_hash.byte_count,
                }
        finally:
            for handle in handles.values():
                handle.close()

        bucket_assets = {}
        for bucket in bucket_ids:
            records = bucket_metadata[bucket]
            if not records:
                continue
            asset_name = f"{cohort}-bucket-{bucket}.zip"
            asset_path = outdir / asset_name
            meta = {
                "schema_version": SCHEMA_VERSION,
                "cohort": cohort,
                "sample_count": len(sample_cases),
                "scale": EXPRESSION_SCALE,
                "missing": MISSING_EXPRESSION,
                "transform": "log2(TPM+1)",
                "genes": records,
            }
            with zipfile.ZipFile(
                asset_path,
                mode="w",
                compression=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            ) as archive:
                archive.writestr("meta.json", _json_bytes(meta))
                archive.write(raw_paths[bucket], arcname="expression.u16le")
            bucket_assets[bucket] = asset_name

    clinical_name = f"{cohort}-clinical.json"
    (outdir / clinical_name).write_bytes(_json_bytes(clinical))
    cohort_manifest = {
        "label": COHORT_LABELS[cohort],
        "sample_count": len(sample_cases),
        "gene_count": len(genes),
        "sample_type_codes": list(_primary_sample_codes(cohort)),
        "clinical_asset": clinical_name,
        "bucket_assets": bucket_assets,
        "source": source_details,
    }
    print(
        f"{cohort}: completed {len(genes):,} genes across {len(bucket_assets)} buckets "
        f"for {len(sample_cases):,} matched primary cancer samples",
        flush=True,
    )
    return cohort_manifest, genes


def _asset_checksums(outdir: Path) -> dict[str, dict[str, Any]]:
    checksums = {}
    for path in sorted(outdir.iterdir()):
        if path.is_file() and not path.name.startswith(("manifest-", "SHA256SUMS")):
            payload = path.read_bytes()
            checksums[path.name] = {
                "sha256": hashlib.sha256(payload).hexdigest(),
                "bytes": len(payload),
            }
    return checksums


def build_release(
    *,
    cohorts: list[str],
    outdir: Path,
    data_version: str,
    survival_source: str,
    probemap_source: str,
    expression_file: str | None = None,
    expression_url_template: str = GDC_EXPRESSION_URL,
    wanted_genes: set[str] | None = None,
    survival_public_url: str | None = None,
    expression_public_url: str | None = None,
) -> Path:
    """Build one immutable data-release directory."""
    outdir.mkdir(parents=True, exist_ok=True)
    survival_text = _read_small_source(survival_source, public_url=survival_public_url)
    probemap_text = _read_small_source(probemap_source)
    survival = load_survival(survival_text)
    probemap, ambiguous_count = load_probemap(probemap_text)
    catalog: dict[tuple[str, str], dict[str, Any]] = {}
    cohort_details = {}
    for cohort in cohorts:
        expression_source = (
            expression_file
            if expression_file is not None
            else expression_url_template.format(cohort=cohort)
        )
        details, genes = build_cohort(
            cohort,
            expression_source=expression_source,
            survival=survival,
            probemap=probemap,
            outdir=outdir,
            wanted_genes=wanted_genes,
            expression_public_url=(
                expression_public_url or expression_url_template.format(cohort=cohort)
            ),
        )
        cohort_details[cohort] = details
        for gene in genes:
            key = (gene["symbol"], gene["ensembl"])
            entry = catalog.setdefault(key, {**gene, "cohorts": []})
            entry["cohorts"].append(cohort)

    checksums = _asset_checksums(outdir)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "data_version": data_version.removeprefix("data-v"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expression_encoding": {
            "transform": "log2(TPM+1)",
            "storage": "uint16 little-endian",
            "scale": EXPRESSION_SCALE,
            "missing": MISSING_EXPRESSION,
            "maximum_quantization_error_log2": 0.0005,
            "exact_median_membership_corrections": True,
        },
        "sample_policy": {
            "sample_type": "Cohort-specific primary cancer specimen",
            "default_tcga_sample_codes": list(DEFAULT_PRIMARY_SAMPLE_CODES),
            "cohort_overrides": {
                cohort: list(codes)
                for cohort, codes in sorted(COHORT_PRIMARY_SAMPLE_CODES.items())
            },
            "code_definitions": SAMPLE_TYPE_LABELS,
            "code_table": GDC_SAMPLE_TYPE_CODES_URL,
            "one_sample_per_case": True,
            "case_identifiers_published": False,
        },
        "sources": {
            "expression": {
                "label": "GDC STAR TPM",
                "pipeline": GDC_PIPELINE_URL,
                "dataset_template": expression_url_template,
                "wrangling": "Xena GDC ETL; log2(TPM+1)",
            },
            "survival": {
                "label": "PanCanAtlas TCGA-CDR",
                "url": survival_text.url,
                "sha256": survival_text.sha256,
                "bytes": survival_text.byte_count,
                "citation": TCGA_CDR_CITATION_URL,
            },
            "gene_map": {
                "label": "GENCODE v36 gene probemap",
                "url": probemap_text.url,
                "sha256": probemap_text.sha256,
                "bytes": probemap_text.byte_count,
                "ambiguous_symbols_excluded": ambiguous_count,
            },
        },
        "cohorts": dict(sorted(cohort_details.items())),
        "genes": sorted(
            catalog.values(),
            key=lambda item: (item["symbol"].upper(), item["ensembl"]),
        ),
        "assets": checksums,
    }
    manifest_name = f"manifest-{manifest['data_version']}.json"
    manifest_path = outdir / manifest_name
    manifest_path.write_bytes(_json_bytes(manifest))
    checksum_lines = [
        f"{details['sha256']}  {name}" for name, details in sorted(checksums.items())
    ]
    checksum_lines.append(
        f"{hashlib.sha256(manifest_path.read_bytes()).hexdigest()}  {manifest_name}"
    )
    (outdir / "SHA256SUMS").write_text("\n".join(checksum_lines) + "\n")
    return manifest_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="survscope-build-data",
        description="Stream TCGA sources into compact SurvScope release assets.",
    )
    parser.add_argument(
        "--cohorts",
        nargs="+",
        default=list(COHORTS),
        help="TCGA abbreviations; defaults to all 33 supported cohorts.",
    )
    parser.add_argument("--outdir", required=True)
    parser.add_argument("--data-version", default=DEFAULT_DATA_VERSION)
    parser.add_argument("--survival-source", default=TCGA_CDR_URL)
    parser.add_argument("--probemap-source", default=GDC_PROBEMAP_URL)
    parser.add_argument(
        "--expression-file",
        help="Local .tsv.gz for a one-cohort validation build.",
    )
    parser.add_argument("--expression-url-template", default=GDC_EXPRESSION_URL)
    parser.add_argument(
        "--expression-public-url",
        help="Canonical URL recorded when --expression-file is used.",
    )
    parser.add_argument(
        "--survival-public-url",
        help="Canonical URL recorded when --survival-source is a local fixture.",
    )
    parser.add_argument(
        "--genes",
        nargs="+",
        help="Optional gene-symbol subset for fixtures or smoke builds.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cohorts = [cohort.upper() for cohort in args.cohorts]
    unknown = sorted(set(cohorts) - set(COHORTS))
    if unknown:
        raise SystemExit(f"Unsupported cohorts: {', '.join(unknown)}")
    if args.expression_file and len(cohorts) != 1:
        raise SystemExit("--expression-file requires exactly one --cohorts value")
    manifest = build_release(
        cohorts=cohorts,
        outdir=Path(args.outdir),
        data_version=args.data_version,
        survival_source=args.survival_source,
        probemap_source=args.probemap_source,
        expression_file=args.expression_file,
        expression_url_template=args.expression_url_template,
        wanted_genes={gene.upper() for gene in args.genes} if args.genes else None,
        survival_public_url=args.survival_public_url,
        expression_public_url=args.expression_public_url,
    )
    print(manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
