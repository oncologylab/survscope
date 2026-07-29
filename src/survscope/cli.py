"""Command-line interface for SurvScope."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .analysis import analyze
from .constants import DEFAULT_DATA_VERSION
from .data import DataStore
from .plotting import plot


def _store(args: argparse.Namespace) -> DataStore:
    return DataStore(
        data_version=args.data_version,
        base=getattr(args, "data_dir", None),
        cache=not getattr(args, "no_cache", False),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="survscope",
        description="Reproducible TCGA Kaplan-Meier survival plots.",
    )
    parser.add_argument(
        "--data-version",
        default=DEFAULT_DATA_VERSION,
        help=f"Immutable data release (default: {DEFAULT_DATA_VERSION}).",
    )
    parser.add_argument(
        "--data-dir",
        default=None,
        help="Local data asset directory; defaults to the matching GitHub Release.",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Do not retain selected remote data chunks in the local cache.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    plot_parser = subparsers.add_parser("plot", help="Analyze and plot one gene/cohort.")
    plot_parser.add_argument("--gene", required=True)
    plot_parser.add_argument("--cohort", required=True)
    plot_parser.add_argument(
        "--cutoff",
        default="median",
        help="Use 'median' or a numeric TPM cutoff.",
    )
    plot_parser.add_argument(
        "--format",
        nargs="+",
        choices=("pdf", "svg", "png"),
        default=("pdf",),
        dest="formats",
    )
    plot_parser.add_argument("--dpi", type=int, choices=(150, 300, 600), default=300)
    plot_parser.add_argument("--outdir", default=".")
    plot_parser.add_argument(
        "--json",
        action="store_true",
        help="Also save endpoint statistics and provenance as JSON.",
    )

    cohorts_parser = subparsers.add_parser("cohorts", help="List supported cohorts.")
    cohorts_parser.add_argument("--json", action="store_true")

    genes_parser = subparsers.add_parser("genes", help="Search supported genes.")
    genes_parser.add_argument("query", nargs="?", default="")
    genes_parser.add_argument("--cohort")
    genes_parser.add_argument("--json", action="store_true")

    subparsers.add_parser("data-info", help="Show data-release provenance.")
    cache_parser = subparsers.add_parser("cache", help="Manage selected-chunk cache.")
    cache_parser.add_argument("action", choices=("clear",))
    return parser


def _parse_cutoff(value: str) -> str | float:
    if value.lower() == "median":
        return "median"
    try:
        return float(value)
    except ValueError as error:
        raise SystemExit("--cutoff must be 'median' or a numeric TPM value") from error


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    store = _store(args)

    if args.command == "plot":
        result = analyze(
            args.gene,
            args.cohort,
            cutoff=_parse_cutoff(args.cutoff),
            store=store,
        )
        outputs = plot(result, formats=args.formats, output_dir=args.outdir, dpi=args.dpi)
        for path in outputs.paths:
            print(path)
        if args.json:
            path = Path(args.outdir) / f"{result.filename_stem}.json"
            path.write_text(json.dumps(result.to_dict(), indent=2, allow_nan=False) + "\n")
            print(path)
        return 0

    if args.command == "cohorts":
        cohorts = store.available_cohorts()
        if args.json:
            print(json.dumps(cohorts, indent=2))
        else:
            for cohort in cohorts:
                print(
                    f"{cohort['code']}\t{cohort['sample_count']}\t"
                    f"{cohort['gene_count']}\t{cohort['label']}"
                )
        return 0

    if args.command == "genes":
        genes = (
            store.search_genes(args.query, cohort=args.cohort)
            if args.query
            else store.manifest["genes"][:100]
        )
        if args.json:
            print(json.dumps(genes, indent=2))
        else:
            for gene in genes:
                print(f"{gene['symbol']}\t{gene['ensembl']}")
        return 0

    if args.command == "data-info":
        info = {
            "data_version": store.manifest["data_version"],
            "schema_version": store.manifest["schema_version"],
            "created_at": store.manifest["created_at"],
            "sources": store.manifest["sources"],
            "cohort_count": len(store.manifest["cohorts"]),
            "gene_count": len(store.manifest["genes"]),
        }
        print(json.dumps(info, indent=2))
        return 0

    if args.command == "cache":
        removed = store.clear_cache()
        print(f"Cleared {removed}")
        return 0

    print("Unknown command", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
