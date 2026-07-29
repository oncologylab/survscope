from __future__ import annotations

from pathlib import Path

import pytest

from survscope.data import DataStore


@pytest.fixture(scope="session")
def fixture_data_dir() -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "web"
        / "public"
        / "data"
        / "2026.07.28"
    )


@pytest.fixture(scope="session")
def store(fixture_data_dir: Path) -> DataStore:
    return DataStore(base=fixture_data_dir, cache=False)
