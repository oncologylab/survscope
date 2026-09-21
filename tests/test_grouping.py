from __future__ import annotations

import json

import numpy as np
import pytest

from survscope import GroupingSpec, analyze
from survscope.grouping import assign_groups, expression_quantile, normalize_grouping
from survscope.statistics import confidence_bounds, cox_fit, km_timeline


@pytest.mark.parametrize(
    "spec",
    [
        {"kind": "percentile", "percentile": 50},
        {"kind": "percentile_groups", "lowerPercent": 50, "upperPercent": 50},
    ],
)
def test_median_aliases_preserve_reference_groups(store, spec):
    reference = analyze("SRD5A1", "PAAD", store=store).to_dict()
    assert analyze("SRD5A1", "PAAD", grouping=spec, store=store).to_dict() == reference


@pytest.mark.parametrize(
    "spec",
    [
        {"kind": "percentile", "percentile": "75"},
        {"kind": "percentile", "percentile": 0},
        {"kind": "percentile", "percentile": 50, "threshold": 10},
        {"kind": "mean", "threshold": 10},
        {"kind": "percentile_groups", "lowerPercent": 60, "upperPercent": 60},
        {"kind": "percentile_groups", "lowerPercent": 50, "upperPercent": 50, "threshold": 10},
        {"kind": "tpm", "threshold": float("nan")},
        {"kind": "tpm", "threshold": True},
    ],
)
def test_invalid_grouping_is_rejected(spec):
    with pytest.raises(ValueError):
        normalize_grouping(grouping=spec)


def test_percentile_groups_keep_ties_together_and_exclude_middle():
    values = np.array([0, 0, 1, 2, 3, 3, 3, 4], dtype=float)
    spec = GroupingSpec("percentile_groups", lower_percent=25, upper_percent=25)
    low, high, lower, upper = assign_groups(values, np.arange(8), {}, spec)
    assert (lower, upper) == (0.75, 3)
    assert np.flatnonzero(low).tolist() == [0, 1]
    assert np.flatnonzero(high).tolist() == [7]
    assert np.sum(~(low | high)) == 5


def test_quantile_matches_r_operation_order_at_observed_boundary():
    # R type 7 gives index 8 exactly here; a zero-valued neighbour must not
    # nudge the threshold below the eighth observed value.
    values = np.array([0] * 7 + [0.9999999999999999] * 4)
    assert expression_quantile(values, 0.7) == values[7]


def test_extreme_counts_and_serialized_provenance(store):
    result = analyze(
        "SRD5A1",
        "PAAD",
        store=store,
        grouping=GroupingSpec("percentile_groups", lower_percent=25, upper_percent=25),
    )
    assert result.endpoints["OS"].eligible_n == 177
    for endpoint in result.endpoints.values():
        assert endpoint.n + endpoint.excluded_middle == endpoint.eligible_n
        assert endpoint.excluded_middle > 0
        assert endpoint.lower_threshold < endpoint.upper_threshold
        assert np.isnan(endpoint.cutoff_tpm)
    encoded = json.dumps(result.to_dict(), allow_nan=False)
    assert '"statistics_version": "1"' in encoded
    assert '"lowerPercent": 25' in encoded
    assert "TCGA-IB-" not in encoded


@pytest.mark.parametrize(
    ("time", "event", "high", "status"),
    [
        ([1, 2, 3, 4], [1, 1, 1, 1], [1, 1, 0, 0], "separation"),
        ([1, 2, 3, 4], [0, 0, 1, 1], [1, 1, 0, 0], "no_information"),
        ([1, 2, 3, 4], [0, 0, 0, 0], [1, 1, 0, 0], "no_events"),
    ],
)
def test_invalid_cox_fit_is_not_a_capped_hazard_ratio(time, event, high, status):
    hr, p, observed = cox_fit(np.array(time), np.array(event), np.array(high))
    assert observed == status
    assert np.isnan(hr) and np.isnan(p)


def test_censors_at_event_time_remain_in_risk_set():
    timeline = km_timeline(np.array([1, 1, 2]), np.array([1, 0, 1]))
    assert timeline[0]["atRisk"] == 3
    assert timeline[0]["events"] == timeline[0]["censored"] == 1
    assert timeline[0]["survival"] == pytest.approx(2 / 3)
    assert timeline[0]["greenwood"] == pytest.approx(1 / 6)
    lo, hi = confidence_bounds(2 / 3, 1 / 6)
    assert lo == pytest.approx(0.2995071303590223)
    assert hi == 1
    assert all(np.isnan(x) for x in confidence_bounds(0, None))


@pytest.mark.parametrize(
    "options",
    [
        ["--grouping", "median", "--show-q"],
        ["--grouping", "mean"],
        ["--grouping", "percentile", "--percentile", "75"],
        ["--grouping", "percentile_groups", "--lower-percent", "25", "--upper-percent", "25"],
    ],
)
def test_cli_comparisons_reach_analysis(fixture_data_dir, tmp_path, options):
    from survscope.cli import main

    assert (
        main(
            [
                "--data-dir",
                str(fixture_data_dir),
                "--data-version",
                "2026.07.28",
                "plot",
                "--gene",
                "SRD5A1",
                "--cohort",
                "PAAD",
                *options,
                "--format",
                "svg",
                "--json",
                "--outdir",
                str(tmp_path),
            ]
        )
        == 0
    )
    output = json.loads((tmp_path / "SRD5A1_TCGA_PAAD_KM_survival.json").read_text())
    assert output["grouping"]["kind"] == options[1]
    assert output["endpoints"]["OS"]["eligible_n"] == 177
    svg = (tmp_path / "SRD5A1_TCGA_PAAD_KM_survival.svg").read_text()
    assert ("q=" in svg) == ("--show-q" in options)


def test_cli_percentage_options_require_a_grouping():
    from survscope.cli import main

    with pytest.raises(SystemExit, match="require --grouping"):
        main(["plot", "--gene", "SRD5A1", "--cohort", "PAAD", "--percentile", "75"])


def test_legacy_grouping_alias_has_identical_results(store):
    old = {"kind": "extremes", "lowerPercent": 20, "upperPercent": 30}
    new = {**old, "kind": "percentile_groups"}
    assert analyze("SRD5A1", "PAAD", grouping=old, store=store).to_dict() == analyze(
        "SRD5A1", "PAAD", grouping=new, store=store
    ).to_dict()
    assert normalize_grouping(grouping=old).to_dict()["kind"] == "percentile_groups"
