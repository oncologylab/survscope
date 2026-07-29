from __future__ import annotations

import hashlib
import json

import numpy as np
import pytest

from survscope.builder import (
    SourceText,
    _bucket_for,
    _is_primary_cancer_sample,
    _primary_sample_codes,
    load_probemap,
)
from survscope.data import DataStore


def test_manifest_and_assets_are_self_consistent(fixture_data_dir):
    manifest_path = fixture_data_dir / "manifest-2026.07.28.json"
    manifest = json.loads(manifest_path.read_text())
    assert manifest["schema_version"] == 1
    assert manifest["data_version"] == "2026.07.28"
    assert set(manifest["cohorts"]) == {"PAAD"}
    assert len(manifest["genes"]) == 6
    assert all("/home/" not in json.dumps(value) for value in manifest.values())
    for name, details in manifest["assets"].items():
        path = fixture_data_dir / name
        assert path.is_file()
        assert path.stat().st_size == details["bytes"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == details["sha256"]


def test_release_contains_no_raw_tcga_matrix(fixture_data_dir):
    forbidden = (".tsv", ".tsv.gz", ".bam", ".h5", ".hdf5")
    assert not [
        path
        for path in fixture_data_dir.iterdir()
        if path.name.lower().endswith(forbidden)
    ]
    clinical = json.loads((fixture_data_dir / "PAAD-clinical.json").read_text())
    assert clinical["identifiers_included"] is False
    assert "sample_ids" not in clinical


def test_gene_bucket_has_fixed_width_expression(store: DataStore):
    data = store.load_gene("LAMB3", "PAAD")
    assert data.encoded_expression.dtype == np.dtype("<u2")
    assert len(data.encoded_expression) == data.clinical["sample_count"] == 178
    assert np.nanmax(data.expression_log2_tpm1) < 30
    assert np.nanmin(data.expression_tpm) >= 0


def test_default_store_reads_fine_grained_static_assets():
    store = DataStore(data_version="2026.07.28", cache=False)
    assert store.base == "https://oncologylab.github.io/survscope/data/2026.07.28"


def test_bucket_assignment_is_stable():
    assert _bucket_for("SRD5A1") == _bucket_for("srd5a1")
    assert len(_bucket_for("SRD5A1")) == 2


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
    with pytest.raises(KeyError, match="Unsupported TCGA cohort"):
        store._load_clinical("NOPE")
