"""Build-time access to open CPTAC RNA expression and GDC overall survival.

Raw STAR files are consumed in memory, with at most three sample streams in
one cohort at a time. Only anonymous compact assets and aggregate provenance are written.
"""

from __future__ import annotations

import csv
import hashlib
import http.client
import io
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, deque
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO

import numpy as np

from .constants import ENDPOINTS, EXPRESSION_SCALE, GDC_PIPELINE_URL, MISSING_EXPRESSION

GDC_API = "https://api.gdc.cancer.gov"
CPTAC_URL = (
    "https://gdc.cancer.gov/about-gdc/contributed-genomic-data-cancer-research/"
    "clinical-proteomic-tumor-analysis-consortium-cptac"
)
SURVIVAL_DOCS = "https://docs.gdc.cancer.gov/API/Users_Guide/Data_Analysis/"


def _in(field: str, values: tuple[str, ...] | list[str]) -> dict[str, Any]:
    return {"op": "in", "content": {"field": field, "value": list(values)}}


@dataclass(frozen=True)
class CptacCohort:
    label: str
    sites: tuple[str, ...]
    disease: str
    diagnoses: tuple[str, ...]
    sample_types: tuple[str, ...] = ("Primary Tumor",)
    project: str = "CPTAC-3"

    def filters(self, prefix: str = "") -> dict[str, Any]:
        return {
            "op": "and",
            "content": [
                _in(f"{prefix}project.project_id", (self.project,)),
                _in(f"{prefix}primary_site", self.sites),
                _in(f"{prefix}disease_type", (self.disease,)),
                _in(f"{prefix}diagnoses.primary_diagnosis", self.diagnoses),
            ],
        }


# Explicit histology filters avoid mixing lung histologies, benign kidney
# lesions, or non-GBM gliomas. GDC labels RCC as NOS; do not relabel it ccRCC.
CPTAC_COHORTS = {
    "CPTAC-3-GBM": CptacCohort(
        "Glioblastoma / gliosarcoma",
        ("Brain",),
        "Gliomas",
        ("Glioblastoma", "Glioblastoma multiforme", "Gliosarcoma"),
    ),
    "CPTAC-3-HNSC": CptacCohort(
        "Head and neck squamous cell carcinoma",
        (
            "Base of tongue",
            "Other and unspecified parts of tongue",
            "Gum",
            "Floor of mouth",
            "Other and unspecified parts of mouth",
            "Lip",
            "Tonsil",
            "Oropharynx",
            "Larynx",
            "Other and ill-defined sites in lip, oral cavity and pharynx",
        ),
        "Squamous Cell Neoplasms",
        ("Squamous cell carcinoma, NOS",),
    ),
    "CPTAC-3-LAML": CptacCohort(
        "Acute myeloid leukemia",
        ("Hematopoietic and reticuloendothelial systems",),
        "Myeloid Leukemias",
        ("Acute myeloid leukemia, NOS",),
        (
            "Primary Blood Derived Cancer - Bone Marrow",
            "Primary Blood Derived Cancer - Peripheral Blood",
        ),
    ),
    "CPTAC-3-LUAD": CptacCohort(
        "Lung adenocarcinoma",
        ("Bronchus and lung",),
        "Adenomas and Adenocarcinomas",
        ("Adenocarcinoma, NOS",),
    ),
    "CPTAC-3-LUSC": CptacCohort(
        "Lung squamous cell carcinoma",
        ("Bronchus and lung",),
        "Squamous Cell Neoplasms",
        ("Squamous cell carcinoma, NOS",),
    ),
    "CPTAC-3-PAAD": CptacCohort(
        "Pancreatic ductal adenocarcinoma",
        ("Pancreas",),
        "Ductal and Lobular Neoplasms",
        ("Infiltrating duct carcinoma, NOS",),
    ),
    "CPTAC-3-RCC": CptacCohort(
        "Renal cell carcinoma (GDC NOS)",
        ("Kidney",),
        "Adenomas and Adenocarcinomas",
        ("Renal cell carcinoma, NOS",),
    ),
    "CPTAC-3-SKCM": CptacCohort(
        "Cutaneous melanoma",
        ("Skin",),
        "Nevi and Melanomas",
        ("Malignant melanoma, NOS",),
    ),
    "CPTAC-3-STAD": CptacCohort(
        "Gastric adenocarcinoma",
        ("Stomach",),
        "Adenomas and Adenocarcinomas",
        ("Adenocarcinoma, NOS",),
    ),
    "CPTAC-3-UCEC": CptacCohort(
        "Endometrioid endometrial adenocarcinoma",
        ("Uterus, NOS",),
        "Adenomas and Adenocarcinomas",
        ("Endometrioid adenocarcinoma, NOS",),
    ),
    "CPTAC-3-ASTRO": CptacCohort(
        "Astrocytoma (GDC NOS)", ("Brain",), "Gliomas", ("Astrocytoma, NOS",),
    ),
    "CPTAC-3-OLIGO": CptacCohort(
        "Oligodendroglioma", ("Brain",), "Gliomas",
        ("Oligodendroglioma, NOS", "Oligodendroglioma, anaplastic"),
    ),
    "CPTAC-3-GLIOMA": CptacCohort(
        "Glioma (GDC NOS)", ("Brain",), "Gliomas", ("Glioma, NOS",),
    ),
    "CPTAC-3-KIRP": CptacCohort(
        "Papillary renal cell carcinoma", ("Kidney",), "Adenomas and Adenocarcinomas",
        ("Papillary renal cell carcinoma",),
    ),
    "CPTAC-3-KICH": CptacCohort(
        "Chromophobe renal cell carcinoma", ("Kidney",), "Adenomas and Adenocarcinomas",
        ("Renal cell carcinoma, chromophobe type",),
    ),
    "CPTAC-3-FHRCC": CptacCohort(
        "Hereditary leiomyomatosis-associated renal cell carcinoma", ("Kidney",),
        "Adenomas and Adenocarcinomas",
        ("Hereditary leiomyomatosis & RCC-associated renal cell carcinoma",),
    ),
    "CPTAC-3-UTUC": CptacCohort(
        "Renal urothelial carcinoma", ("Kidney",),
        "Transitional Cell Papillomas and Carcinomas", ("Urothelial carcinoma, NOS",),
    ),
    "CPTAC-3-SCCNOS": CptacCohort(
        "Squamous carcinoma (ill-defined site)", ("Other and ill-defined sites",),
        "Squamous Cell Neoplasms", ("Squamous cell carcinoma, NOS",),
    ),
}


class GdcClient:
    """Small, paginated, retrying client used exclusively by the data builder."""

    def __init__(self) -> None:
        self.provenance: list[dict[str, Any]] = []

    def open(self, path: str, **params: Any) -> Any:
        query = urllib.parse.urlencode(
            {
                key: json.dumps(value, separators=(",", ":"))
                if isinstance(value, (dict, list))
                else value
                for key, value in params.items()
            }
        )
        url = f"{GDC_API}/{path}" + (f"?{query}" if query else "")
        request = urllib.request.Request(url, headers={"User-Agent": "survscope/0.1"})
        for attempt in range(4):
            try:
                return urllib.request.urlopen(request, timeout=180)
            except urllib.error.HTTPError as error:
                if error.code not in {429, 500, 502, 503, 504} or attempt == 3:
                    raise
            except (urllib.error.URLError, TimeoutError):
                if attempt == 3:
                    raise
            time.sleep(2**attempt)
        raise RuntimeError("Unreachable GDC retry state")

    def get(self, path: str, **params: Any) -> dict[str, Any]:
        with self.open(path, **params) as response:
            payload = response.read()
            url = response.url
        result = json.loads(payload)
        if result.get("warnings") or result.get("errors") or result.get("error"):
            reason = result.get("warnings") or result.get("errors") or result.get("error")
            raise RuntimeError(f"GDC rejected part of the {path} query: {reason}")
        self.provenance.append(
            {
                "url": url,
                "sha256": hashlib.sha256(payload).hexdigest(),
                "bytes": len(payload),
            }
        )
        return result

    def search(self, entity: str, filters: dict, fields: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        key = "case_id" if entity == "cases" else "file_id"
        seen: set[str] = set()
        expected_total: int | None = None
        while True:
            result = self.get(
                entity,
                filters=filters,
                fields=fields,
                size=500,
                sort=f"{key}:asc",
                **{"from": len(rows)},
            )["data"]
            total = int(result["pagination"]["total"])
            if expected_total is not None and total != expected_total:
                raise RuntimeError("GDC search changed during pagination; retry the build")
            expected_total = total
            page = result["hits"]
            for row in page:
                if row[key] in seen:
                    raise RuntimeError(f"GDC returned duplicate {entity} across pages")
                seen.add(row[key])
            rows.extend(page)
            if len(rows) == total:
                return rows
            if not page or len(rows) > total:
                raise RuntimeError(f"Incomplete GDC {entity} pagination")


def survival_rows(payload: dict[str, Any], cases: dict[str, Any]) -> dict[str, tuple[float, int]]:
    """Use GDC's OS donor times in days; censored=True means event=0."""
    results = payload.get("results", [])
    if len(results) != 1:
        raise RuntimeError("Expected exactly one GDC survival cohort")
    rows = {}
    seen = set()
    for donor in results[0].get("donors", []):
        case_id = donor["id"]
        if case_id in seen:
            raise RuntimeError("Duplicate donor in GDC survival response")
        seen.add(case_id)
        if case_id not in cases:
            raise RuntimeError("GDC survival returned a donor outside the requested cohort")
        vital = cases[case_id].get("demographic", {}).get("vital_status", "").lower()
        if vital not in {"alive", "dead"}:
            continue
        censored = donor.get("censored")
        if not isinstance(censored, bool) or censored != (vital == "alive"):
            raise RuntimeError("GDC survival censoring conflicts with case vital status")
        try:
            days = float(donor["time"])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(days) and days > 0:
            rows[case_id] = (days, int(not censored))
    return rows


def select_files(
    files: list[dict[str, Any]],
    cases: dict[str, Any],
    sample_types: tuple[str, ...],
) -> tuple[dict[str, dict[str, Any]], int]:
    """Choose one unambiguously linked primary specimen per case, deterministically."""
    candidates: dict[str, list[tuple[int, str, str, dict[str, Any]]]] = {}
    ambiguous = 0
    for file in files:
        if (
            file.get("access") != "open"
            or file.get("data_type") != "Gene Expression Quantification"
            or file.get("analysis", {}).get("workflow_type") != "STAR - Counts"
        ):
            raise RuntimeError("GDC returned a non-open or non-STAR expression file")
        linked = file.get("cases", [])
        if len(linked) != 1 or len(linked[0].get("samples", [])) != 1:
            ambiguous += 1
            continue
        case_id = linked[0]["case_id"]
        sample = linked[0]["samples"][0]
        kind = sample.get("sample_type")
        if case_id not in cases or kind not in sample_types:
            continue
        candidates.setdefault(case_id, []).append(
            (
                sample_types.index(kind),
                sample["sample_id"],
                file["file_id"],
                file,
            )
        )
    return {
        case: sorted(items, key=lambda item: item[:3])[0][3] for case, items in candidates.items()
    }, ambiguous


def read_star_tpm(
    stream: BinaryIO,
    *,
    expected_md5: str,
    expected_bytes: int,
    wanted_genes: set[str] | None = None,
) -> tuple[dict[str, tuple[str, float]], dict[str, Any]]:
    """Parse and checksum a full STAR stream without retaining or caching the file."""
    md5 = hashlib.md5()  # GDC transport checksum, not a security primitive.
    sha256 = hashlib.sha256()
    size = 0
    models: set[str] = set()

    def lines() -> Iterator[str]:
        nonlocal size
        for raw in stream:
            md5.update(raw)
            sha256.update(raw)
            size += len(raw)
            line = raw.decode("utf-8")
            if line.startswith("#"):
                if line.startswith("# gene-model:"):
                    models.add(line.partition(":")[2].strip())
                continue
            yield line

    reader = csv.DictReader(lines(), delimiter="\t")
    if not {"gene_id", "gene_name", "tpm_unstranded"}.issubset(reader.fieldnames or []):
        raise RuntimeError("STAR file is missing gene_id, gene_name, or tpm_unstranded")
    genes: dict[str, tuple[str, float]] = {}
    ambiguous: set[str] = set()
    for row in reader:
        ensembl = row["gene_id"].split(".", 1)[0]
        symbol = row["gene_name"].strip()
        if not ensembl.startswith("ENSG") or not symbol:
            continue
        key = symbol.upper()
        if wanted_genes is not None and key not in wanted_genes:
            continue
        if key in genes:
            ambiguous.add(key)
        value = row["tpm_unstranded"]
        try:
            tpm = float(value) if value else np.nan
        except (TypeError, ValueError) as error:
            raise RuntimeError(f"Invalid STAR TPM for {symbol}") from error
        if not math.isnan(tpm) and (not math.isfinite(tpm) or tpm < 0):
            raise RuntimeError(f"Invalid STAR TPM for {symbol}")
        genes[key] = (ensembl, tpm)
    if md5.hexdigest() != expected_md5 or size != expected_bytes:
        raise RuntimeError("STAR source checksum or byte count mismatch")
    if len(models) != 1:
        raise RuntimeError("STAR file must declare one GENCODE gene model")
    for key in ambiguous:
        genes.pop(key, None)
    declared_model = next(iter(models))
    # One GDC CPTAC melanoma STAR file has this duplicated-v header typo.
    # Its complete gene mapping matches v36; cross-file mapping checks stay strict.
    model = {"GENCODE vv36": "GENCODE v36"}.get(declared_model, declared_model)
    return genes, {
        "sha256": sha256.hexdigest(),
        "bytes": size,
        "gene_model": model,
        "gene_model_declared": declared_model,
        "ambiguous_symbols_excluded": len(ambiguous),
    }


def _stream_samples(client: GdcClient, files: list[dict], wanted_genes: set[str] | None):
    """Yield verified samples in input order, buffering at most three downloads."""
    def read(file):
        for attempt in range(3):
            try:
                with client.open(f"data/{file['file_id']}") as response:
                    return read_star_tpm(
                        response, expected_md5=file["md5sum"],
                        expected_bytes=file["file_size"], wanted_genes=wanted_genes,
                    )
            except (http.client.IncompleteRead, ConnectionError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(2**attempt)
        raise RuntimeError("Unreachable STAR retry state")

    remaining = iter(files)
    with ThreadPoolExecutor(max_workers=3) as pool:
        pending = deque()
        for file in remaining:
            pending.append((file, pool.submit(read, file)))
            if len(pending) == 3:
                break
        while pending:
            file, future = pending.popleft()
            genes, provenance = future.result()
            yield file, genes, provenance
            following = next(remaining, None)
            if following is not None:
                pending.append((following, pool.submit(read, following)))


def build_cptac_cohort(
    cohort: str,
    *,
    outdir: Path,
    wanted_genes: set[str] | None = None,
    client: GdcClient | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Stream one CPTAC cohort and emit the existing compact TPM schema."""
    from .builder import _bucket_for, _json_bytes, _median_metadata

    spec = CPTAC_COHORTS[cohort]
    client = client or GdcClient()
    status = client.get("status")
    source_start = len(client.provenance)
    cases = {
        case["case_id"]: case
        for case in client.search(
            "cases",
            spec.filters(),
            "case_id,demographic.vital_status",
        )
    }
    os_rows = survival_rows(
        client.get("analysis/survival", filters=[spec.filters("cases.")]), cases
    )
    if not os_rows:
        raise RuntimeError(f"{cohort}: no usable GDC overall-survival records")
    filters = spec.filters("cases.")
    filters["content"].extend(
        [
            _in("access", ("open",)),
            _in("data_type", ("Gene Expression Quantification",)),
            _in("analysis.workflow_type", ("STAR - Counts",)),
        ]
    )
    files = client.search(
        "files",
        filters,
        "file_id,md5sum,file_size,access,data_type,analysis.workflow_type,"
        "cases.case_id,cases.samples.sample_id,cases.samples.sample_type",
    )
    selected, ambiguous = select_files(files, cases, spec.sample_types)
    case_order = sorted(set(selected) & set(os_rows))
    if not case_order:
        raise RuntimeError(f"{cohort}: no matched primary expression and overall survival")
    sample_count = len(case_order)
    small_cohort_note = (
        f"Only {sample_count} matched {'patient' if sample_count == 1 else 'patients'}; "
        "survival comparisons may be uninformative. "
        if sample_count < 20 else ""
    )
    unavailable = "Not supplied by the GDC CPTAC overall-survival source."
    clinical = {
        "schema_version": 1,
        "cohort": cohort,
        "program": "CPTAC",
        "sample_count": sample_count,
        "sample_type": " / ".join(spec.sample_types),
        "identifiers_included": False,
        "endpoints": {
            endpoint: {
                "time": [os_rows[case][0] for case in case_order]
                if endpoint == "OS"
                else [None] * sample_count,
                "event": [os_rows[case][1] for case in case_order]
                if endpoint == "OS"
                else [None] * sample_count,
                "quality": "caution" if endpoint == "OS" else "unavailable",
                "quality_note": (
                    small_cohort_note + "GDC overall survival; follow-up completeness varies. "
                    "TCGA-CDR recommendations do not apply."
                    if endpoint == "OS"
                    else unavailable
                ),
            }
            for endpoint in ENDPOINTS
        },
    }
    print(f"{cohort}: streaming {sample_count} matched primary samples", flush=True)
    source_hash = hashlib.sha256()
    records: list[tuple[str, str]] = []
    matrix: np.ndarray | None = None
    gene_model = None
    declared_models: Counter[str] = Counter()
    bytes_streamed = 0
    ambiguous_symbols = 0
    sample_streams = _stream_samples(client, [selected[case] for case in case_order], wanted_genes)
    for column, (file, genes, provenance) in enumerate(sample_streams):
        observed = sorted((symbol, value[0]) for symbol, value in genes.items())
        if column == 0:
            if not observed:
                raise RuntimeError(f"{cohort}: no requested, uniquely mapped genes")
            records = observed
            gene_model = provenance["gene_model"]
            matrix = np.full((len(records), sample_count), np.nan)
        if observed != records or provenance["gene_model"] != gene_model:
            raise RuntimeError("STAR gene mappings changed within the cohort; rebuild separately")
        declared_models[provenance["gene_model_declared"]] += 1
        assert matrix is not None
        matrix[:, column] = [math.log2(genes[symbol][1] + 1) for symbol, _ in records]
        bytes_streamed += provenance["bytes"]
        ambiguous_symbols = max(ambiguous_symbols, provenance["ambiguous_symbols_excluded"])
        source_hash.update(
            _json_bytes({"file_id": file["file_id"], "md5": file["md5sum"], **provenance})
        )
        if (column + 1) % 10 == 0 or column + 1 == sample_count:
            print(f"{cohort}: streamed {column + 1}/{sample_count} samples", flush=True)
    end_status = client.get("status")
    if status.get("data_release") != end_status.get("data_release") or status.get(
        "tag"
    ) != end_status.get("tag"):
        raise RuntimeError("GDC release changed during the build; retry")

    assert matrix is not None
    outdir.mkdir(parents=True, exist_ok=True)
    buffers: dict[str, io.BytesIO] = {}
    metadata: dict[str, list[dict[str, Any]]] = {}
    catalog = []
    for index, (symbol, ensembl) in enumerate(records):
        values = matrix[index]
        encoded = np.full(sample_count, MISSING_EXPRESSION, dtype="<u2")
        finite = np.isfinite(values)
        encoded[finite] = np.rint(values[finite] * EXPRESSION_SCALE).astype("<u2")
        bucket = _bucket_for(symbol)
        entries = metadata.setdefault(bucket, [])
        buffers.setdefault(bucket, io.BytesIO()).write(encoded.tobytes())
        entries.append(
            {
                "symbol": symbol,
                "ensembl": ensembl,
                "row": len(entries),
                "medians": _median_metadata(values, encoded, clinical),
            }
        )
        catalog.append({"symbol": symbol, "ensembl": ensembl, "bucket": bucket})
    bucket_assets = {}
    for bucket, entries in sorted(metadata.items()):
        name = f"{cohort}-bucket-{bucket}.zip"
        with zipfile.ZipFile(outdir / name, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            archive.writestr(
                "meta.json",
                _json_bytes(
                    {
                        "schema_version": 1,
                        "cohort": cohort,
                        "sample_count": sample_count,
                        "scale": EXPRESSION_SCALE,
                        "missing": MISSING_EXPRESSION,
                        "transform": "log2(TPM+1)",
                        "genes": entries,
                    }
                ),
            )
            archive.writestr("expression.u16le", buffers[bucket].getvalue())
        bucket_assets[bucket] = name
    clinical_name = f"{cohort}-clinical.json"
    (outdir / clinical_name).write_bytes(_json_bytes(clinical))
    return {
        "label": spec.label,
        "program": "CPTAC",
        "project": spec.project,
        "sample_count": sample_count,
        "gene_count": len(catalog),
        "available_endpoints": ["OS"],
        "sample_types": list(spec.sample_types),
        "clinical_asset": clinical_name,
        "bucket_assets": bucket_assets,
        "selection": spec.filters(),
        "coverage": {
            "cases": len(cases),
            "cases_with_os": len(os_rows),
            "cases_with_primary_expression": len(selected),
            "matched_cases": sample_count,
            "ambiguous_files_excluded": ambiguous,
            "os_events": sum(os_rows[case][1] for case in case_order),
        },
        "sources": {
            "expression": {
                "label": "GDC STAR TPM",
                "pipeline": GDC_PIPELINE_URL,
                "url": CPTAC_URL,
                "gene_model": gene_model,
                "ambiguous_symbols_excluded": ambiguous_symbols,
            },
            "survival": {
                "label": "GDC CPTAC overall survival",
                "citation": SURVIVAL_DOCS,
                "url": f"{GDC_API}/analysis/survival",
                "time_unit": "days",
            },
        },
        "source": {
            "gdc_release": status,
            "metadata": client.provenance[source_start:],
            "selected_files_sha256": source_hash.hexdigest(),
            "file_count": sample_count,
            "bytes_streamed": bytes_streamed,
            "file_checksums_verified": True,
            "gene_model_declarations": dict(sorted(declared_models.items())),
            "sample_selection": "One primary specimen per case; sample-type priority, "
            "then sample UUID and file UUID lexical order",
        },
    }, catalog
