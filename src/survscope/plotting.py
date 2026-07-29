"""Publication-style Matplotlib output matching the SurvScope reference."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from .constants import ENDPOINTS
from .models import PlotOutputs, SurvivalAnalysis
from .statistics import format_p

COLORS = {"Low": "#2f6fb0", "High": "#c43c39"}


def apply_plot_style() -> None:
    plt.rcParams.update(
        {
            "font.family": "sans-serif",
            "font.sans-serif": ["Liberation Sans", "Arial", "Helvetica", "DejaVu Sans"],
            "font.size": 9,
            "font.weight": "bold",
            "axes.labelweight": "bold",
            "axes.titleweight": "bold",
            "axes.linewidth": 0.9,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
            "svg.fonttype": "none",
        }
    )


def _bold_axis_text(axis) -> None:
    for label in axis.get_xticklabels() + axis.get_yticklabels():
        label.set_fontsize(9)
        label.set_fontweight("bold")
    axis.xaxis.label.set_fontsize(9)
    axis.xaxis.label.set_fontweight("bold")
    axis.yaxis.label.set_fontsize(9)
    axis.yaxis.label.set_fontweight("bold")


def create_figure(analysis: SurvivalAnalysis):
    """Create but do not save the canonical 6.8-inch figure."""
    apply_plot_style()
    figure, axes = plt.subplots(2, 2, figsize=(6.8, 6.8))
    for axis, endpoint in zip(axes.flat, ENDPOINTS, strict=True):
        result = analysis.endpoints[endpoint]
        for label, curve in (("Low", result.low), ("High", result.high)):
            if curve is None:
                continue
            axis.step(
                curve.x_months,
                curve.survival,
                where="post",
                color=COLORS[label],
                linewidth=2.1,
                label=f"{label} n={curve.n}, e={curve.events}",
            )
        annotation = (
            f"p={format_p(result.logrank_p)} q={format_p(result.logrank_q)}\n"
            f"HR={result.cox_hr:.2f}"
            if np.isfinite(result.cox_hr)
            else f"p={format_p(result.logrank_p)} q={format_p(result.logrank_q)}\nHR=NA"
        )
        axis.text(
            0.97,
            0.06,
            annotation,
            transform=axis.transAxes,
            ha="right",
            va="bottom",
            fontsize=9,
            fontweight="bold",
        )
        axis.set_title(f"{analysis.gene} {endpoint}", fontsize=9, fontweight="bold")
        axis.set_xlabel("Months", fontsize=9, fontweight="bold")
        axis.set_ylabel("Survival", fontsize=9, fontweight="bold")
        axis.set_ylim(-0.03, 1.03)
        axis.set_xlim(left=0)
        axis.set_box_aspect(1)
        axis.tick_params(axis="both", labelsize=9, width=0.9)
        _bold_axis_text(axis)
        if result.low is not None or result.high is not None:
            axis.legend(
                frameon=False,
                loc="upper right",
                prop={"size": 8, "weight": "bold"},
                handlelength=2.0,
            )
        axis.spines[["top", "right"]].set_visible(False)

    figure.suptitle(
        f"{analysis.gene} TCGA-{analysis.cohort} survival",
        y=0.995,
        fontsize=12,
        fontweight="bold",
    )
    figure.text(
        0.5,
        0.958,
        "Expression: GDC STAR TPM; endpoints: PanCanAtlas TCGA-CDR",
        ha="center",
        va="top",
        fontsize=9,
        fontweight="bold",
    )
    figure.tight_layout(rect=(0, 0, 1, 0.93), h_pad=1.5, w_pad=1.5)
    return figure


def plot(
    analysis: SurvivalAnalysis,
    formats: tuple[str, ...] | list[str] = ("pdf",),
    output_dir: str | Path = ".",
    dpi: int = 300,
) -> PlotOutputs:
    """Save the canonical figure in PDF, SVG, and/or PNG formats."""
    requested = tuple(dict.fromkeys(item.lower() for item in formats))
    unsupported = sorted(set(requested) - {"pdf", "svg", "png"})
    if unsupported:
        raise ValueError(f"unsupported output formats: {', '.join(unsupported)}")
    if dpi not in {150, 300, 600}:
        raise ValueError("PNG dpi must be one of 150, 300, or 600")
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    figure = create_figure(analysis)
    paths = []
    try:
        for output_format in requested:
            path = destination / f"{analysis.filename_stem}.{output_format}"
            save_options = {"dpi": dpi} if output_format == "png" else {}
            figure.savefig(path, **save_options)
            paths.append(path)
    finally:
        plt.close(figure)
    return PlotOutputs(paths=tuple(paths))
