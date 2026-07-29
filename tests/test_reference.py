from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from survscope import analyze, plot

REFERENCE = {
    "OS": {
        "n": 177,
        "n_low": 89,
        "n_high": 88,
        "events": 93,
        "p": 0.0017777122420538,
        "q": 0.0068997729476924,
        "hr": 1.929912608978088,
        "cutoff": 9.1298,
    },
    "DSS": {
        "n": 171,
        "n_low": 86,
        "n_high": 85,
        "events": 73,
        "p": 0.0034498864738462,
        "q": 0.0068997729476924,
        "hr": 2.0031607454050797,
        "cutoff": 9.1298,
    },
    "PFI": {
        "n": 177,
        "n_low": 89,
        "n_high": 88,
        "events": 104,
        "p": 0.0237952679723401,
        "q": 0.0317270239631202,
        "hr": 1.557826378555585,
        "cutoff": 9.1298,
    },
    "DFI": {
        "n": 69,
        "n_low": 35,
        "n_high": 34,
        "events": 23,
        "p": 0.0761030785678586,
        "q": 0.0761030785678586,
        "hr": 2.143639694009769,
        "cutoff": 8.2968,
    },
}


def test_srd5a1_matches_reference_statistics(store):
    result = analyze("SRD5A1", "PAAD", store=store)
    assert result.filename_stem == "SRD5A1_TCGA_PAAD_KM_survival"
    for endpoint, expected in REFERENCE.items():
        observed = result.endpoints[endpoint]
        assert observed.n == expected["n"]
        assert observed.n_low == expected["n_low"]
        assert observed.n_high == expected["n_high"]
        assert observed.events == expected["events"]
        assert np.isclose(observed.logrank_p, expected["p"], rtol=2e-10)
        assert np.isclose(observed.logrank_q, expected["q"], rtol=2e-10)
        assert np.isclose(observed.cox_hr, expected["hr"], rtol=2e-8)
        assert np.isclose(observed.cutoff_tpm, expected["cutoff"], rtol=2e-10)


def test_reference_figure_contract(store, tmp_path: Path):
    result = analyze("SRD5A1", "PAAD", store=store)
    outputs = plot(
        result,
        formats=("pdf", "svg", "png"),
        output_dir=tmp_path,
        dpi=150,
    )
    assert [path.suffix for path in outputs.paths] == [".pdf", ".svg", ".png"]
    pdf = outputs.paths[0].read_bytes()
    assert b"/MediaBox [ 0 0 489.6 489.6 ]" in pdf
    assert b"LiberationSans-Bold" in pdf
    svg = outputs.paths[1].read_text()
    assert 'width="489.6pt"' in svg
    assert "SRD5A1 TCGA-PAAD survival" in svg
    assert "PanCanAtlas TCGA-CDR" in svg
    assert outputs.paths[2].stat().st_size > 20_000


def test_result_is_json_serializable_without_sample_identifiers(store):
    result = analyze("ITGA2", "PAAD", store=store)
    encoded = json.dumps(result.to_dict(), allow_nan=False)
    assert "TCGA-IB-" not in encoded
    assert "ITGA2" in encoded


def test_custom_cutoff_is_supported(store):
    result = analyze("NID1", "PAAD", cutoff=10.0, store=store)
    assert all(item.cutoff_tpm == 10.0 for item in result.endpoints.values())
    assert all(item.n_low + item.n_high == item.n for item in result.endpoints.values())
