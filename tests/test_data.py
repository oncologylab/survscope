from __future__ import annotations

import hashlib
import io
import json
import urllib.error

import numpy as np
import pytest

from survscope.builder import (
    SourceText,
    _is_primary_cancer_sample,
    _primary_sample_codes,
    load_probemap,
)
from survscope.data import DataStore
from survscope.encoding import bucket_for
from survscope.validation import validate_release


def test_manifest_and_assets_are_self_consistent(fixture_data_dir):
    manifest = validate_release(fixture_data_dir, required_cohorts=["PAAD"])
    assert manifest["schema_version"] == 1
    assert manifest["data_version"] == "2026.07.28"
    assert set(manifest["cohorts"]) == {"PAAD"}
    assert len(manifest["genes"]) == 6
    assert all("/home/" not in json.dumps(value) for value in manifest.values())


def test_clinical_asset_omits_sample_identifiers(fixture_data_dir):
    clinical = json.loads((fixture_data_dir / "PAAD-clinical.json").read_text())
    assert "sample_ids" not in clinical


def test_gene_bucket_has_fixed_width_expression(store: DataStore):
    data = store.load_gene("LAMB3", "PAAD")
    assert data.encoded_expression.dtype == np.dtype("<u2")
    assert len(data.encoded_expression) == data.clinical["sample_count"] == 178
    assert np.nanmax(data.expression_log2_tpm1) < 30
    assert np.nanmin(data.expression_tpm) >= 0


def test_default_store_uses_versioned_pages_url():
    store = DataStore(data_version="2026.07.28", cache=False)
    assert store.base == "https://oncologylab.github.io/survscope/data/2026.07.28"


def test_bucket_assignment_is_stable():
    assert bucket_for("SRD5A1") == bucket_for("srd5a1")
    assert len(bucket_for("SRD5A1")) == 2


def test_primary_sample_policy_handles_solid_and_blood_cancers():
    assert _primary_sample_codes("PAAD") == ("01",)
    assert _primary_sample_codes("LAML") == ("03",)
    assert _is_primary_cancer_sample("TCGA-2J-AAB1-01A", "PAAD")
    assert not _is_primary_cancer_sample("TCGA-2J-AAB1-11A", "PAAD")
    assert _is_primary_cancer_sample("TCGA-AB-2802-03A", "LAML")
    assert not _is_primary_cancer_sample("TCGA-AB-2802-01A", "LAML")


def test_probemap_excludes_ambiguous_symbols():
    payload = (
        "id\tgene\tchrom\tchromStart\tchromEnd\tstrand\n"
        "ENSG1.1\tGOOD\tchr1\t1\t2\t+\n"
        "ENSG2.1\tDUP\tchr1\t1\t2\t+\n"
        "ENSG3.1\tDUP\tchr1\t1\t2\t+\n"
    )
    source = SourceText(
        text=payload,
        url="memory",
        sha256=hashlib.sha256(payload.encode()).hexdigest(),
        byte_count=len(payload),
    )
    mapping, ambiguous = load_probemap(source)
    assert mapping["ENSG1.1"] == ("GOOD", "ENSG1")
    assert "ENSG2.1" not in mapping
    assert ambiguous == 1


def test_unknown_gene_and_cohort_are_clear_errors(store):
    with pytest.raises(KeyError, match="Gene not found"):
        store.load_gene("NOT_A_REAL_GENE", "PAAD")
    with pytest.raises(KeyError, match="Unsupported cohort"):
        store._load_clinical("NOPE")


def test_remote_assets_are_verified_and_download_errors_wrapped(fixture_data_dir, monkeypatch):
    def urlopen(request, timeout):
        name = request.full_url.rsplit("/", 1)[1]
        payload = (fixture_data_dir / name).read_bytes()
        return io.BytesIO(payload + b" " if name == "PAAD-clinical.json" else payload)

    monkeypatch.setattr("survscope.data.urllib.request.urlopen", urlopen)
    store = DataStore("2026.07.28", base="https://example.org/data", cache=False)
    with pytest.raises(RuntimeError, match="does not match its manifest checksum"):
        store.load_gene("SRD5A1", "PAAD")

    def unreachable(request, timeout):
        raise urllib.error.URLError("offline")

    monkeypatch.setattr("survscope.data.urllib.request.urlopen", unreachable)
    store = DataStore("2026.07.28", base="https://example.org/data", cache=False)
    with pytest.raises(RuntimeError, match="Unable to download .*: offline"):
        store.available_cohorts()
