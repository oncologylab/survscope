"""Compact expression encoding shared by the data builders and readers."""

from __future__ import annotations

import hashlib
import json
import zipfile
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np

from .constants import (
    BUCKET_COUNT,
    ENDPOINTS,
    EXPRESSION_SCALE,
    MISSING_EXPRESSION,
    SCHEMA_VERSION,
)


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n").encode()


def bucket_for(symbol: str) -> str:
    value = hashlib.sha256(symbol.upper().encode()).digest()[0] % BUCKET_COUNT
    return f"{value:02x}"


def number_array(values: Sequence[float | int | None]) -> np.ndarray:
    return np.asarray([np.nan if value is None else value for value in values], dtype=float)


def endpoint_valid(tpm: np.ndarray, time: np.ndarray, event: np.ndarray) -> np.ndarray:
    """Samples with expression, a positive follow-up time, and a binary event."""
    return np.isfinite(tpm) & np.isfinite(time) & np.isin(event, [0, 1]) & (time > 0)


def encode_log2(values: np.ndarray) -> np.ndarray:
    encoded = np.full(len(values), MISSING_EXPRESSION, dtype="<u2")
    finite = np.isfinite(values)
    quantized = np.rint(values[finite] * EXPRESSION_SCALE)
    encoded[finite] = np.clip(quantized, 0, MISSING_EXPRESSION - 1).astype("<u2")
    return encoded


def decode_log2(
    encoded: np.ndarray,
    scale: int = EXPRESSION_SCALE,
    missing: int = MISSING_EXPRESSION,
) -> np.ndarray:
    values = encoded.astype(float)
    values[encoded == missing] = np.nan
    values /= scale
    return values


def median_metadata(
    expression_log2: np.ndarray,
    encoded: np.ndarray,
    clinical: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    """Record exact median cutoffs and the samples whose group quantization flips."""
    exact_tpm = np.exp2(expression_log2) - 1.0
    decoded_tpm = np.exp2(decode_log2(encoded)) - 1.0
    metadata = {}
    for endpoint in ENDPOINTS:
        endpoint_values = clinical["endpoints"][endpoint]
        time = number_array(endpoint_values["time"])
        event = number_array(endpoint_values["event"])
        valid = endpoint_valid(exact_tpm, time, event)
        if not np.any(valid):
            metadata[endpoint] = {"cutoff_tpm": None, "flips": []}
            continue
        cutoff = float(np.median(exact_tpm[valid]))
        exact_high = exact_tpm > cutoff
        encoded_high = decoded_tpm > cutoff
        flips = np.flatnonzero(valid & (exact_high != encoded_high)).astype(int).tolist()
        metadata[endpoint] = {"cutoff_tpm": cutoff, "flips": flips}
    return metadata


def write_bucket(
    path: Path,
    *,
    cohort: str,
    sample_count: int,
    genes: list[dict[str, Any]],
    expression: bytes | Path,
) -> None:
    meta = {
        "schema_version": SCHEMA_VERSION,
        "cohort": cohort,
        "sample_count": sample_count,
        "scale": EXPRESSION_SCALE,
        "missing": MISSING_EXPRESSION,
        "transform": "log2(TPM+1)",
        "genes": genes,
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("meta.json", json_bytes(meta))
        if isinstance(expression, Path):
            archive.write(expression, arcname="expression.u16le")
        else:
            archive.writestr("expression.u16le", expression)
