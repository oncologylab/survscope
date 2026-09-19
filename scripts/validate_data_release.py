#!/usr/bin/env python3
"""Run the package validator without installing plotting dependencies on Pages."""

import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(
        str(Path(__file__).resolve().parents[1] / "src/survscope/validation.py"),
        run_name="__main__",
    )
