"""Compare Python and browser analysis against independently executed R survival.

Only existing compact assets and small anonymous synthetic cases are read.
Intermediate vectors live in a temporary directory, never a data release.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy

from survscope.analysis import analyze_gene_data
from survscope.constants import ENDPOINTS
from survscope.data import DataStore, GeneData
from survscope.grouping import assign_groups, normalize_grouping
from survscope.statistics import confidence_bounds

ROOT = Path(__file__).resolve().parents[1]
GROUPINGS = [
    {"kind": "median"},
    {"kind": "mean"},
    {"kind": "tpm", "threshold": 10},
    {"kind": "percentile", "percentile": 75},
    {"kind": "percentile", "percentile": 50},
    {"kind": "extremes", "lowerPercent": 25, "upperPercent": 25},
    {"kind": "extremes", "lowerPercent": 100 / 3, "upperPercent": 100 / 3},
    {"kind": "extremes", "lowerPercent": 20, "upperPercent": 30},
]
FIELDS = {
    "n": "n",
    "n_low": "nLow",
    "n_high": "nHigh",
    "events": "events",
    "events_low": "eventsLow",
    "events_high": "eventsHigh",
    "eligible_n": "eligibleN",
    "excluded_middle": "excludedMiddle",
    "lower_threshold": "lowerThreshold",
    "upper_threshold": "upperThreshold",
    "logrank_chi2": "logrankChi2",
    "logrank_p": "logrankP",
    "logrank_q": "logrankQ",
    "cox_hr": "coxHr",
    "cox_p": "coxP",
}
COUNTS = {"n", "nLow", "nHigh", "events", "eventsLow", "eventsHigh", "eligibleN", "excludedMiddle"}


def wire(data: GeneData) -> dict:
    return {
        "gene": {"symbol": data.symbol, "ensembl": data.ensembl, "row": 0, "medians": data.medians},
        "cohort": data.cohort,
        "cohortLabel": data.cohort_label,
        "dataVersion": data.data_version,
        "expression": data.encoded_expression.tolist(),
        "scale": data.scale,
        "missing": data.missing,
        "clinical": data.clinical,
    }


def from_wire(data: dict) -> GeneData:
    return GeneData(
        symbol=data["gene"]["symbol"],
        ensembl=data["gene"]["ensembl"],
        cohort=data["cohort"],
        encoded_expression=np.array(data["expression"], dtype="<u2"),
        medians=data["gene"]["medians"],
        clinical=data["clinical"],
        cohort_label=data["cohortLabel"],
        data_version=data["dataVersion"],
        sources={"expression": {"label": "validation"}, "survival": {"label": "validation"}},
        scale=data["scale"],
        missing=data["missing"],
    )


def fixture_cases(base: Path, version: str, genes: list[str] | None = None) -> list[dict]:
    manifest = DataStore(base=base, data_version=version, cache=False).manifest
    cases = []
    for cohort in manifest["cohorts"]:
        # Keep bucket caches bounded to a single cohort.
        store = DataStore(base=base, data_version=version, cache=False)
        selected = genes or [g["symbol"] for g in manifest["genes"] if cohort in g["cohorts"]]
        available = {g["symbol"] for g in manifest["genes"] if cohort in g["cohorts"]}
        for gene in selected:
            if gene not in available:
                continue
            data = wire(store.load_gene(gene, cohort))
            for index, grouping in enumerate(GROUPINGS):
                cases.append({"id": f"{cohort}/{gene}/{index}", "data": data, "grouping": grouping})
    return cases


def synthetic_cases() -> list[dict]:
    examples = [
        (
            "tied_events_censors",
            [1, 1, 2, 2, 3, 4, 5, 5],
            [1, 0, 1, 1, 0, 1, 1, 0],
            [0, 1, 0, 1, 1, 0, 1, 0],
        ),
        ("separated_both_event_groups", [1, 2, 3, 4], [1, 1, 1, 1], [1, 1, 0, 0]),
        ("one_event_group", [1, 2, 3, 4], [1, 1, 0, 0], [1, 1, 0, 0]),
        ("no_information", [1, 2, 3, 4], [0, 0, 1, 1], [1, 1, 0, 0]),
        ("all_censored", [1, 2, 3, 4], [0, 0, 0, 0], [0, 1, 0, 1]),
        ("one_patient", [3], [1], [0]),
        ("constant_expression", [1, 2, 3, 4], [1, 0, 1, 1], [1, 1, 1, 1]),
        (
            "invalid_rows",
            [0, -1, None, 2, 3, 4, 5, 6],
            [1, 0, 1, None, 2, 1, 0, 1],
            [0, 1, 0, 1, 0, 1, 0, 1],
        ),
        ("null_effect", [1, 1, 2, 2, 3, 3], [1, 1, 1, 1, 1, 1], [0, 1, 0, 1, 0, 1]),
        (
            "close_times",
            [1, 1.00000001, 2, 2.00000001, 3, 4],
            [1, 1, 0, 1, 1, 0],
            [0, 1, 0, 1, 1, 0],
        ),
    ]
    cases = []
    for name, time, event, high in examples:
        data = {
            "gene": {
                "symbol": name,
                "ensembl": "synthetic",
                "row": 0,
                "medians": {ep: {"cutoff_tpm": 0.5, "flips": []} for ep in ENDPOINTS},
            },
            "cohort": "synthetic",
            "cohortLabel": "synthetic",
            "dataVersion": "synthetic",
            "expression": [1000 * x for x in high],
            "scale": 1000,
            "missing": 65535,
            "clinical": {
                "endpoints": {
                    ep: {
                        "time": time,
                        "event": event,
                        "quality": "caution",
                        "quality_note": "Synthetic validation",
                    }
                    for ep in ENDPOINTS
                }
            },
        }
        for index, grouping in enumerate([{"kind": "tpm", "threshold": 0.5}, *GROUPINGS]):
            cases.append({"id": f"synthetic/{name}/{index}", "data": data, "grouping": grouping})
    return cases


def python_result(item: dict) -> dict:
    data = from_wire(item["data"])
    spec = normalize_grouping(grouping=item["grouping"])
    analysis = analyze_gene_data(data, grouping=spec)
    output: dict = {"id": item["id"], "endpoints": {}, "groups": {}, "intervals": {}}
    for ep, result in analysis.endpoints.items():
        clinical = data.clinical["endpoints"][ep]
        time = np.array(clinical["time"], dtype=float)
        event = np.array(clinical["event"], dtype=float)
        tpm = data.expression_tpm
        valid = np.isfinite(tpm) & np.isfinite(time) & (time > 0) & np.isin(event, [0, 1])
        indices = np.flatnonzero(valid)
        low, high, _, _ = assign_groups(tpm[valid], indices, data.medians[ep], spec)
        output["groups"][ep] = {"low": indices[low].tolist(), "high": indices[high].tolist()}
        endpoint = {js: result.to_dict()[py] for py, js in FIELDS.items()}
        output["intervals"][ep] = {}
        for name in ("low", "high"):
            curve = getattr(result, name)
            endpoint[name] = {"timeline": curve.timeline}
            output["intervals"][ep][name] = [
                [confidence_bounds(p["survival"], p["greenwood"], level) for p in curve.timeline]
                for level in (0.9, 0.95, 0.99)
            ]
        output["endpoints"][ep] = endpoint
    return output


def compare(expected: list, actual: list, name: str) -> dict:
    maxima: dict[str, float] = {}
    failures = []

    def check(a, b, field, path):
        a = float(a) if a is not None else math.nan
        b = float(b) if b is not None else math.nan
        if not math.isfinite(a) or not math.isfinite(b):
            if math.isfinite(a) != math.isfinite(b):
                failures.append(f"{path}: availability differs ({a}, {b})")
            return
        error = abs(math.log(a) - math.log(b)) if field == "coxHr" else abs(a - b)
        maxima[field] = max(maxima.get(field, 0), error)
        tolerance = 0 if field in COUNTS or field in {"atRisk", "censored"} else 1e-10
        if field in {"lowerThreshold", "upperThreshold"}:
            tolerance = 1e-10 * max(1, abs(a))
        if field == "coxHr":
            tolerance = 1e-5 if name == "R" else 2e-8
        if field == "coxP":
            tolerance = 1e-4 if name == "R" else 1e-7
        if error > tolerance:
            failures.append(f"{path}: {a} != {b} (error {error:.4g}, tolerance {tolerance})")

    assert len(expected) == len(actual)
    for reference, observed in zip(expected, actual, strict=True):
        assert reference["id"] == observed["id"]
        prefix = reference["id"]
        if reference["groups"] != observed["groups"]:
            failures.append(f"{prefix}: group membership differs")
        for ep in ENDPOINTS:
            a = reference["endpoints"][ep]
            b = observed["endpoints"][ep]
            for field in FIELDS.values():
                check(a[field], b[field], field, f"{prefix}/{ep}/{field}")
            for group in ("low", "high"):
                at = a[group]["timeline"]
                bt = b[group]["timeline"]
                if len(at) != len(bt):
                    failures.append(f"{prefix}/{ep}/{group}: timeline lengths differ")
                    continue
                for i, (ap, bp) in enumerate(zip(at, bt, strict=True)):
                    for field in ap:
                        check(ap[field], bp[field], field, f"{prefix}/{ep}/{group}/{i}/{field}")
                for level in range(3):
                    ac = reference["intervals"][ep][group][level]
                    bc = observed["intervals"][ep][group][level]
                    for i, (av, bv) in enumerate(zip(ac, bc, strict=True)):
                        for j in range(2):
                            check(
                                av[j],
                                bv[j],
                                "confidence",
                                f"{prefix}/{ep}/{group}/CI/{level}/{i}/{j}",
                            )
    return {"maximum_errors": maxima, "failure_count": len(failures), "failures": failures[:30]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--data-version", default="2026.09.18")
    parser.add_argument("--genes", nargs="+", default=["SRD5A1", "TP53", "EGFR"])
    parser.add_argument(
        "--output", type=Path, default=ROOT / "data-build/statistical-validation.json"
    )
    args = parser.parse_args()
    if args.data_dir:
        cases = fixture_cases(args.data_dir, args.data_version, args.genes)
    else:
        cases = fixture_cases(ROOT / "web/public/data/2026.07.28", "2026.07.28")
        cases += fixture_cases(ROOT / "tests/fixtures/cptac/2026.09.18", "2026.09.18")
    cases += synthetic_cases()
    print(f"Validating {len(cases)} comparisons against Python, JavaScript, and R", flush=True)
    with tempfile.TemporaryDirectory(prefix="survscope-statistics-") as directory:
        directory = Path(directory)
        input_path = directory / "cases.json"
        input_path.write_text(json.dumps(cases, allow_nan=False))
        js_path = directory / "browser.mjs"
        r_path = directory / "reference.json"
        subprocess.run(
            [
                str(ROOT / "web/node_modules/.bin/esbuild"),
                str(ROOT / "scripts/statistics-browser.ts"),
                "--bundle",
                "--platform=node",
                "--format=esm",
                f"--outfile={js_path}",
            ],
            check=True,
        )
        browser = json.loads(subprocess.check_output(["node", str(js_path), str(input_path)]))
        subprocess.run(
            ["Rscript", str(ROOT / "scripts/statistics-reference.R"), str(input_path), str(r_path)],
            check=True,
        )
        reference = json.loads(r_path.read_text())
        python = [python_result(item) for item in cases]
    report = {
        "case_count": len(cases),
        "endpoint_count": len(cases) * 4,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "versions": {
            **reference["versions"],
            "Python": platform.python_version(),
            "NumPy": np.__version__,
            "SciPy": scipy.__version__,
            "Node": subprocess.check_output(["node", "--version"], text=True).strip(),
        },
        "coverage": {
            "cohorts": sorted(
                {c["data"]["cohort"] for c in cases if c["data"]["cohort"] != "synthetic"}
            ),
            "genes": sorted(
                {c["data"]["gene"]["symbol"] for c in cases if c["data"]["cohort"] != "synthetic"}
            ),
            "data_versions": sorted(
                {c["data"]["dataVersion"] for c in cases if c["data"]["cohort"] != "synthetic"}
            ),
            "groupings": GROUPINGS,
        },
        "source_sha256": {
            str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in [
                ROOT / "src/survscope/analysis.py",
                ROOT / "src/survscope/statistics.py",
                ROOT / "src/survscope/grouping.py",
                ROOT / "web/src/statistics.ts",
                ROOT / "web/src/numeric.ts",
                ROOT / "web/src/grouping.ts",
                ROOT / "scripts/statistics-reference.R",
            ]
        },
        "JavaScript": compare(python, browser, "JavaScript"),
        "R": compare(python, reference["results"], "R"),
        "cox_error_scale": "absolute difference in log hazard ratio",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps(report, indent=2), flush=True)
    if report["JavaScript"]["failure_count"] or report["R"]["failure_count"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
