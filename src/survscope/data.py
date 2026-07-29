"""Read compact SurvScope release assets from disk or GitHub Releases."""

from __future__ import annotations

import io
import json
import os
import shutil
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from .constants import DEFAULT_DATA_VERSION, EXPRESSION_SCALE, MISSING_EXPRESSION


def _default_cache_dir() -> Path:
    base = os.environ.get("XDG_CACHE_HOME")
    if base:
        return Path(base) / "survscope"
    return Path.home() / ".cache" / "survscope"


@dataclass(frozen=True)
class GeneData:
    symbol: str
    ensembl: str
    cohort: str
    encoded_expression: np.ndarray
    medians: dict[str, dict[str, Any]]
    clinical: dict[str, Any]
    cohort_label: str
    data_version: str
    sources: dict[str, Any]
    scale: int = EXPRESSION_SCALE
    missing: int = MISSING_EXPRESSION

    @property
    def expression_log2_tpm1(self) -> np.ndarray:
        values = self.encoded_expression.astype(float)
        values[self.encoded_expression == self.missing] = np.nan
        values /= self.scale
        return values

    @property
    def expression_tpm(self) -> np.ndarray:
        return np.exp2(self.expression_log2_tpm1) - 1.0


class DataStore:
    """Access one immutable SurvScope data release.

    ``base`` may be a local directory or an HTTP(S) directory. Remote reads
    fetch only the manifest, selected cohort clinical JSON, and selected gene
    bucket. Files are cached by default and can be disabled with ``cache=False``.
    """

    def __init__(
        self,
        data_version: str = DEFAULT_DATA_VERSION,
        base: str | Path | None = None,
        cache: bool = True,
        cache_dir: str | Path | None = None,
    ) -> None:
        self.data_version = data_version.removeprefix("data-v")
        self.base = (
            str(base)
            if base is not None
            else (
                "https://github.com/oncologylab/survscope/releases/download/"
                f"data-v{self.data_version}"
            )
        )
        self.cache = cache
        self.cache_dir = Path(cache_dir) if cache_dir else _default_cache_dir()
        self._manifest: dict[str, Any] | None = None
        self._clinical: dict[str, dict[str, Any]] = {}
        self._bucket_cache: dict[tuple[str, str], tuple[dict, bytes]] = {}

    @property
    def is_remote(self) -> bool:
        return self.base.startswith(("http://", "https://"))

    @property
    def manifest_name(self) -> str:
        return f"manifest-{self.data_version}.json"

    def _cache_path(self, name: str) -> Path:
        return self.cache_dir / self.data_version / name

    def _read(self, name: str) -> bytes:
        if not self.is_remote:
            path = Path(self.base) / name
            if not path.is_file():
                raise FileNotFoundError(f"SurvScope data asset not found: {path}")
            return path.read_bytes()

        cache_path = self._cache_path(name)
        if self.cache and cache_path.is_file():
            return cache_path.read_bytes()
        url = f"{self.base.rstrip('/')}/{name}"
        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "survscope/0.1"},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = response.read()
        except urllib.error.HTTPError as error:
            raise RuntimeError(
                f"Unable to download SurvScope data asset {name!r} "
                f"for data release {self.data_version}: HTTP {error.code}"
            ) from error
        if self.cache:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = cache_path.with_suffix(cache_path.suffix + ".tmp")
            temporary.write_bytes(payload)
            temporary.replace(cache_path)
        return payload

    @property
    def manifest(self) -> dict[str, Any]:
        if self._manifest is None:
            self._manifest = json.loads(self._read(self.manifest_name))
            schema = self._manifest.get("schema_version")
            if schema != 1:
                raise RuntimeError(f"Unsupported SurvScope data schema: {schema!r}")
        return self._manifest

    def available_cohorts(self) -> list[dict[str, Any]]:
        return [
            {
                "code": code,
                "label": details["label"],
                "sample_count": details["sample_count"],
                "gene_count": details["gene_count"],
            }
            for code, details in sorted(self.manifest["cohorts"].items())
        ]

    def search_genes(self, query: str, cohort: str | None = None) -> list[dict[str, str]]:
        needle = query.strip().upper()
        if not needle:
            return []
        cohort = cohort.upper() if cohort else None
        results = []
        for gene in self.manifest["genes"]:
            if cohort and cohort not in gene.get("cohorts", []):
                continue
            if needle in gene["symbol"].upper() or needle in gene["ensembl"].upper():
                results.append(gene)
                if len(results) >= 100:
                    break
        return results

    def resolve_gene(self, gene: str, cohort: str) -> dict[str, Any]:
        query = gene.strip().upper()
        cohort = cohort.upper()
        for item in self.manifest["genes"]:
            if query in {item["symbol"].upper(), item["ensembl"].upper()}:
                if cohort not in item.get("cohorts", []):
                    raise KeyError(f"{item['symbol']} is not available for TCGA-{cohort}")
                return item
        raise KeyError(f"Gene not found in SurvScope data release: {gene}")

    def _load_clinical(self, cohort: str) -> dict[str, Any]:
        cohort = cohort.upper()
        if cohort not in self._clinical:
            details = self.manifest["cohorts"].get(cohort)
            if details is None:
                raise KeyError(f"Unsupported TCGA cohort: {cohort}")
            self._clinical[cohort] = json.loads(self._read(details["clinical_asset"]))
        return self._clinical[cohort]

    def _load_bucket(self, cohort: str, bucket: str) -> tuple[dict, bytes]:
        key = (cohort, bucket)
        if key in self._bucket_cache:
            return self._bucket_cache[key]
        details = self.manifest["cohorts"][cohort]
        asset = details["bucket_assets"][bucket]
        with zipfile.ZipFile(io.BytesIO(self._read(asset))) as archive:
            meta = json.loads(archive.read("meta.json"))
            matrix = archive.read("expression.u16le")
        self._bucket_cache[key] = (meta, matrix)
        return meta, matrix

    def load_gene(self, gene: str, cohort: str) -> GeneData:
        cohort = cohort.upper()
        item = self.resolve_gene(gene, cohort)
        bucket = item["bucket"]
        meta, matrix = self._load_bucket(cohort, bucket)
        row_lookup = {record["symbol"].upper(): record for record in meta["genes"]}
        record = row_lookup.get(item["symbol"].upper())
        if record is None:
            raise KeyError(f"{item['symbol']} is missing from TCGA-{cohort} bucket {bucket}")
        sample_count = int(meta["sample_count"])
        offset = int(record["row"]) * sample_count * np.dtype("<u2").itemsize
        values = np.frombuffer(
            matrix,
            dtype="<u2",
            count=sample_count,
            offset=offset,
        ).copy()
        return GeneData(
            symbol=record["symbol"],
            ensembl=record["ensembl"],
            cohort=cohort,
            encoded_expression=values,
            medians=record.get("medians", {}),
            clinical=self._load_clinical(cohort),
            cohort_label=self.manifest["cohorts"][cohort]["label"],
            data_version=self.manifest["data_version"],
            sources=self.manifest["sources"],
            scale=int(meta.get("scale", EXPRESSION_SCALE)),
            missing=int(meta.get("missing", MISSING_EXPRESSION)),
        )

    def clear_cache(self) -> Path:
        path = self.cache_dir / self.data_version
        if path.is_dir():
            shutil.rmtree(path)
        return path
