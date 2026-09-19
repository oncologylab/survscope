from __future__ import annotations

import hashlib
import io
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pytest

from survscope import analyze
from survscope.builder import SourceText, build_release
from survscope.cptac import (
    CPTAC_COHORTS,
    GdcClient,
    build_cptac_cohort,
    read_star_tpm,
    select_files,
    survival_rows,
)
from survscope.data import DataStore

ROOT = Path(__file__).resolve().parents[1]
CPTAC_FIXTURE = ROOT / "tests/fixtures/cptac/2026.09.18"


def star_payload(rows: str) -> bytes:
    return (
        "# gene-model: GENCODE v36\ngene_id\tgene_name\ttpm_unstranded\nN_unmapped\t\t\n" + rows
    ).encode()


def read_star(payload: bytes, **kwargs):
    return read_star_tpm(
        io.BytesIO(payload),
        expected_md5=hashlib.md5(payload).hexdigest(),
        expected_bytes=len(payload),
        **kwargs,
    )


def test_star_uses_tpm_and_excludes_ambiguous_symbols():
    payload = star_payload("ENSG1.1\tGOOD\t3\nENSG2.1\tDUP\t4\nENSG3.1\tdup\t5\n")
    genes, source = read_star(payload)
    assert genes == {"GOOD": ("ENSG1", 3.0)}
    assert source["sha256"] == hashlib.sha256(payload).hexdigest()
    assert source["ambiguous_symbols_excluded"] == 1
    assert read_star(payload, wanted_genes={"MISSING"})[0] == {}


@pytest.mark.parametrize("value", ["-1", "inf", "bad"])
def test_star_rejects_invalid_tpm(value):
    with pytest.raises(RuntimeError, match="Invalid STAR TPM"):
        read_star(star_payload(f"ENSG1.1\tGOOD\t{value}\n"))


def test_star_verifies_entire_source_even_for_gene_subset():
    payload = star_payload("ENSG1.1\tGOOD\t3\nENSG2.1\tOTHER\t4\n")
    with pytest.raises(RuntimeError, match="checksum"):
        read_star_tpm(
            io.BytesIO(payload),
            expected_md5="0" * 32,
            expected_bytes=len(payload),
            wanted_genes={"GOOD"},
        )


def test_observed_gdc_header_typo_is_normalized_and_preserved_in_provenance():
    payload = star_payload("ENSG1.1\tGOOD\t3\n").replace(b"GENCODE v36", b"GENCODE vv36")
    genes, source = read_star(payload)
    assert genes == {"GOOD": ("ENSG1", 3.0)}
    assert source["gene_model"] == "GENCODE v36"
    assert source["gene_model_declared"] == "GENCODE vv36"
    assert source["sha256"] == hashlib.sha256(payload).hexdigest()
    with pytest.raises(RuntimeError, match="byte count"):
        read_star_tpm(
            io.BytesIO(payload),
            expected_md5=hashlib.md5(payload).hexdigest(),
            expected_bytes=len(payload) + 1,
        )


def test_survival_censoring_missingness_and_units():
    cases = {
        str(i): {"demographic": {"vital_status": status}}
        for i, status in enumerate(["Alive", "Dead", "Not Reported", "Dead", "Alive"])
    }
    donors = [
        {"id": str(i), "time": days, "censored": censored}
        for i, (days, censored) in enumerate(
            [(365.25, True), (91, False), (120, True), (None, False), (-1, True)]
        )
    ]
    payload = {"results": [{"donors": donors}]}
    assert survival_rows(payload, cases) == {"0": (365.25, 0), "1": (91.0, 1)}
    donors[1]["censored"] = True
    with pytest.raises(RuntimeError, match="vital status"):
        survival_rows(payload, cases)
    donors[1]["censored"] = False
    donors.append(donors[0])
    with pytest.raises(RuntimeError, match="Duplicate donor"):
        survival_rows(payload, cases)


def expression_file(case, sample, file_id, kind="Primary Tumor", payload=None):
    result = {
        "file_id": file_id,
        "access": "open",
        "data_type": "Gene Expression Quantification",
        "analysis": {"workflow_type": "STAR - Counts"},
        "cases": [{"case_id": case, "samples": [{"sample_id": sample, "sample_type": kind}]}],
    }
    if payload:
        result.update(md5sum=hashlib.md5(payload).hexdigest(), file_size=len(payload))
    return result


def test_primary_sample_selection_is_deterministic_and_never_uses_normals():
    files = [
        expression_file("a", "z", "z"),
        expression_file("a", "a", "a"),
        expression_file("b", "b", "b", "Solid Tissue Normal"),
        expression_file("c", "c", "c", "Metastatic"),
    ]
    ambiguous = expression_file("a", "a", "ambiguous")
    ambiguous["cases"][0]["samples"].append(
        {"sample_id": "normal", "sample_type": "Solid Tissue Normal"}
    )
    files.append(ambiguous)
    cases = dict.fromkeys("abc")
    selected, rejected = select_files(files, cases, ("Primary Tumor",))
    assert {case: file["file_id"] for case, file in selected.items()} == {"a": "a"}
    assert rejected == 1
    assert select_files(list(reversed(files)), cases, ("Primary Tumor",)) == (selected, rejected)
    files[0]["access"] = "controlled"
    with pytest.raises(RuntimeError, match="non-open"):
        select_files(files, cases, ("Primary Tumor",))


def test_catalog_separates_histology_and_handles_blood_samples():
    assert len(CPTAC_COHORTS) == 18
    assert CPTAC_COHORTS["CPTAC-3-LUAD"].disease != CPTAC_COHORTS["CPTAC-3-LUSC"].disease
    assert "Oncocytoma" not in CPTAC_COHORTS["CPTAC-3-RCC"].diagnoses
    assert "Astrocytoma, NOS" not in CPTAC_COHORTS["CPTAC-3-GBM"].diagnoses
    assert (
        "Primary Blood Derived Cancer - Bone Marrow" in CPTAC_COHORTS["CPTAC-3-LAML"].sample_types
    )


class FakeGdc:
    def __init__(self):
        self.provenance = []
        self.payloads = {
            f"file-{i}": star_payload(f"ENSG1.1\tTEST\t{1 + i / 100000}\n") for i in range(4)
        }

    def get(self, path, **params):
        if path == "status":
            return {"data_release": "test release", "tag": "test"}
        assert path == "analysis/survival"
        return {
            "results": [
                {
                    "donors": [
                        {"id": f"case-{i}", "time": 30 + i * 30, "censored": i % 2 == 0}
                        for i in range(4)
                    ]
                }
            ]
        }

    def search(self, entity, filters, fields):
        if entity == "cases":
            return [
                {
                    "case_id": f"case-{i}",
                    "demographic": {
                        "vital_status": "Alive" if i % 2 == 0 else "Dead",
                    },
                }
                for i in range(4)
            ]
        return [
            expression_file(f"case-{i}", f"sample-{i}", key, payload=value)
            for key, value in self.payloads.items()
            for i in [int(key.removeprefix("file-"))]
        ]

    def open(self, path):
        if path == "data/file-0":
            # Later downloads finish first; expression columns must still match clinical rows.
            time.sleep(0.02)
        return io.BytesIO(self.payloads[path.removeprefix("data/")])


@pytest.mark.parametrize("old,new", [(b"GENCODE v36", b"GENCODE v37"),
                                     (b"ENSG1.1", b"ENSG2.1")])
def test_actual_gene_model_or_mapping_changes_still_fail(tmp_path, old, new):
    client = FakeGdc()
    client.payloads["file-1"] = client.payloads["file-1"].replace(old, new)
    with pytest.raises(RuntimeError, match="gene mappings changed"):
        build_cptac_cohort("CPTAC-3-PAAD", outdir=tmp_path, client=client)


def test_header_normalization_records_original_declarations(tmp_path):
    client = FakeGdc()
    client.payloads["file-1"] = client.payloads["file-1"].replace(b"GENCODE v36", b"GENCODE vv36")
    details, genes = build_cptac_cohort("CPTAC-3-PAAD", outdir=tmp_path, client=client)
    assert len(genes) == 1 and details["sample_count"] == 4
    assert details["source"]["gene_model_declarations"] == {"GENCODE v36": 3, "GENCODE vv36": 1}


def test_builder_round_trip_preserves_exact_median_groups_and_anonymity(tmp_path, monkeypatch):
    def build(cohort, **kwargs):
        return build_cptac_cohort(cohort, client=FakeGdc(), **kwargs)

    monkeypatch.setattr("survscope.builder.build_cptac_cohort", build)
    manifest = build_release(
        cohorts=["CPTAC-3-PAAD"],
        outdir=tmp_path,
        data_version="2026.09.18",
        survival_source="unused",
        probemap_source="unused",
    )
    store = DataStore(base=tmp_path, data_version="2026.09.18", cache=False)
    assert store.manifest["schema_version"] == 2
    gene = store.load_gene("TEST", "CPTAC-3-PAAD")
    assert set(gene.encoded_expression) == {1000}
    assert gene.medians["OS"]["flips"] == [2, 3]
    result = analyze("TEST", "CPTAC-3-PAAD", store=store)
    assert (result.endpoints["OS"].n_low, result.endpoints["OS"].n_high) == (2, 2)
    assert result.endpoints["DSS"].n == 0
    assert result.source_survival == "GDC CPTAC overall survival"
    assert "case-" not in manifest.read_text()
    assert "sample-" not in (tmp_path / "CPTAC-3-PAAD-clinical.json").read_text()
    assert {p.suffix for p in tmp_path.iterdir()} == {"", ".json", ".zip"}
    with pytest.raises(ValueError, match="immutable"):
        build_release(
            cohorts=["CPTAC-3-PAAD"],
            outdir=tmp_path,
            data_version="2026.09.18",
            survival_source="unused",
            probemap_source="unused",
        )


def test_mixed_release_uses_cohort_specific_provenance(tmp_path, monkeypatch):
    old = ROOT / "web/public/data/2026.07.28"
    old_manifest = json.loads((old / "manifest-2026.07.28.json").read_text())

    def tcga(cohort, **kwargs):
        for asset in old_manifest["assets"]:
            shutil.copyfile(old / asset, kwargs["outdir"] / asset)
        return old_manifest["cohorts"][cohort], old_manifest["genes"]

    monkeypatch.setattr("survscope.builder.build_cohort", tcga)
    monkeypatch.setattr(
        "survscope.builder._read_small_source",
        lambda *a, **k: SourceText(
            "",
            "https://example.org/test",
            "0" * 64,
            0,
        ),
    )
    monkeypatch.setattr(
        "survscope.builder.build_cptac_cohort",
        lambda cohort, **kwargs: build_cptac_cohort(cohort, client=FakeGdc(), **kwargs),
    )
    build_release(
        cohorts=["PAAD", "CPTAC-3-PAAD"],
        outdir=tmp_path,
        data_version="2026.09.18",
        survival_source="unused",
        probemap_source="unused",
    )
    store = DataStore(base=tmp_path, data_version="2026.09.18", cache=False)
    assert analyze("SRD5A1", "PAAD", store=store).source_survival == "PanCanAtlas TCGA-CDR"
    assert (
        analyze("TEST", "CPTAC-3-PAAD", store=store).source_survival == "GDC CPTAC overall survival"
    )
    assert {item["code"] for item in store.available_cohorts()} == {"PAAD", "CPTAC-3-PAAD"}


@pytest.mark.parametrize("cohort,index", [("CPTAC-3-GLIOMA", 1), ("CPTAC-3-FHRCC", 0)])
def test_single_patient_cohorts_do_not_invent_comparison_statistics(tmp_path, monkeypatch,
                                                                 cohort, index):
    client = FakeGdc()
    client.payloads = {f"file-{index}": client.payloads[f"file-{index}"]}
    monkeypatch.setattr(
        "survscope.builder.build_cptac_cohort",
        lambda code, **kwargs: build_cptac_cohort(code, client=client, **kwargs),
    )
    build_release(
        cohorts=[cohort], outdir=tmp_path, data_version="2026.09.18",
        survival_source="unused", probemap_source="unused",
    )
    store = DataStore(base=tmp_path, data_version="2026.09.18", cache=False)
    result = analyze("TEST", cohort, store=store).endpoints["OS"]
    assert result.n == 1 and result.events == index
    assert np.isnan(result.cox_hr) and np.isnan(result.logrank_p)
    assert "Only 1 matched patient" in result.quality_note


def test_gdc_pagination_and_incomplete_response(monkeypatch):
    client = GdcClient()
    calls = []

    def get(path, **params):
        calls.append(params["from"])
        return {"data": {"pagination": {"total": 2}, "hits": [{"case_id": str(params["from"])}]}}

    monkeypatch.setattr(client, "get", get)
    assert len(client.search("cases", {}, "case_id")) == 2
    assert calls == [0, 1]
    monkeypatch.setattr(
        client,
        "get",
        lambda *a, **k: {
            "data": {
                "pagination": {"total": 2},
                "hits": [],
            }
        },
    )
    with pytest.raises(RuntimeError, match="Incomplete"):
        client.search("cases", {}, "case_id")


def test_live_cptac_fixture_analysis_and_reference_contract():
    store = DataStore(base=CPTAC_FIXTURE, data_version="2026.09.18", cache=False)
    result = analyze("SRD5A1", "CPTAC-3-PAAD", store=store)
    assert result.filename_stem == "SRD5A1_CPTAC_3_PAAD_KM_survival"
    assert result.endpoints["OS"].n == 97
    assert result.endpoints["OS"].events == 76
    assert result.endpoints["OS"].logrank_p == pytest.approx(0.21480036623609935)
    assert result.endpoints["OS"].cox_hr == pytest.approx(1.333170308908182)
    assert result.endpoints["OS"].logrank_q == result.endpoints["OS"].logrank_p
    assert all(result.endpoints[ep].quality == "unavailable" for ep in ("DSS", "PFI", "DFI"))
    assert all(np.isnan(result.endpoints[ep].cox_hr) for ep in ("DSS", "PFI", "DFI"))


def test_release_validation_detects_tampering_and_missing_coverage(tmp_path):
    shutil.copytree(CPTAC_FIXTURE, tmp_path, dirs_exist_ok=True)
    command = [
        sys.executable,
        str(ROOT / "scripts/validate_data_release.py"),
        "--dir",
        str(tmp_path),
    ]
    assert subprocess.run(command, capture_output=True).returncode == 0
    failed = subprocess.run(
        [*command, "--required-cohorts", "PAAD"], capture_output=True, text=True
    )
    assert failed.returncode == 1 and "coverage" in failed.stderr
    with (tmp_path / "CPTAC-3-PAAD-clinical.json").open("a") as file:
        file.write(" ")
    failed = subprocess.run(command, capture_output=True, text=True)
    assert failed.returncode == 1 and "mismatch" in failed.stderr


def test_reuse_preserves_tcga_assets_and_statistics(tmp_path, fixture_data_dir, monkeypatch):
    def no_source_download(*args, **kwargs):
        raise AssertionError("Reusing compact TCGA must not download source matrices")

    monkeypatch.setattr("survscope.builder._read_small_source", no_source_download)
    monkeypatch.setattr("survscope.builder.build_cohort", no_source_download)
    manifest_path = build_release(
        cohorts=["PAAD"], outdir=tmp_path / "release", data_version="2026.09.18",
        survival_source="unused", probemap_source="unused", tcga_release=fixture_data_dir,
    )
    original = json.loads((fixture_data_dir / "manifest-2026.07.28.json").read_text())
    manifest = json.loads(manifest_path.read_text())
    assert manifest["assets"] == original["assets"]
    assert manifest["genes"] == original["genes"]
    assert manifest["cohorts"]["PAAD"]["reused_from"]["data_version"] == "2026.07.28"
    store = DataStore(base=manifest_path.parent, data_version="2026.09.18", cache=False)
    result = analyze("SRD5A1", "PAAD", store=store)
    old_store = DataStore(base=fixture_data_dir, data_version="2026.07.28", cache=False)
    old = analyze("SRD5A1", "PAAD", store=old_store)
    assert result.endpoints["OS"].logrank_p == old.endpoints["OS"].logrank_p
    assert result.endpoints["OS"].cox_hr == old.endpoints["OS"].cox_hr
    with pytest.raises(ValueError, match="missing requested cohorts"):
        build_release(
            cohorts=["BRCA"], outdir=tmp_path / "missing", data_version="2026.09.18",
            survival_source="unused", probemap_source="unused", tcga_release=fixture_data_dir,
        )
