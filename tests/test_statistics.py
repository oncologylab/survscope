from __future__ import annotations

import numpy as np

from survscope.statistics import bh_fdr, cox_binary, kaplan_meier, logrank_test


def test_kaplan_meier_step_coordinates():
    x, y = kaplan_meier(np.array([1, 2, 3]), np.array([1, 0, 1]))
    assert np.array_equal(x, np.array([0, 1, 1, 3, 3, 3]))
    assert np.allclose(y, np.array([1, 1, 2 / 3, 2 / 3, 0, 0]))


def test_logrank_and_cox_return_na_for_one_group():
    time = np.array([1, 2, 3], dtype=float)
    event = np.array([1, 1, 0], dtype=int)
    group = np.array([0, 0, 0], dtype=int)
    assert all(np.isnan(value) for value in logrank_test(time, event, group))
    assert all(np.isnan(value) for value in cox_binary(time, event, group))


def test_bh_ignores_nonfinite_values():
    result = bh_fdr([0.01, np.nan, 0.04, 0.03])
    assert np.allclose(
        [result[0], result[2], result[3]],
        [0.03, 0.04, 0.04],
    )
    assert np.isnan(result[1])
