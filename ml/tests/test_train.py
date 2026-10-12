"""Trainer tests on synthetic matches (no DB, no demos). Run: cd ml && python -m pytest -q"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from cs2ml import train as T
from cs2ml.data import MatchRows, build_dataset
from cs2ml.export import booster_to_spec, predict, raw_scores
from cs2ml.synthetic import FEATURES, synthetic_matches

FIXTURE = Path(__file__).resolve().parents[2] / "scripts/fixtures/winprob-gbdt.json"


@pytest.fixture(scope="module")
def ds():
    return build_dataset(synthetic_matches(30, rounds=16, seed=3))


def test_dataset_weights_rounds_equally(ds):
    sums = np.bincount(ds.rounds, weights=ds.weight)
    assert np.allclose(sums, 1.0)
    assert ds.n_matches == 30
    assert ds.X.shape[1] == len(FEATURES)
    assert np.isnan(ds.X).any(), "not-applicable features stay NaN"


def test_dataset_keeps_newest_version_only():
    old = synthetic_matches(2, rounds=4, seed=9)
    for m in old:
        m.version = 0
    new = synthetic_matches(3, rounds=4, seed=10)
    for m in new:
        m.version = 1
    d = build_dataset(old + new)
    assert d.n_matches == 3 and d.version == 1


def test_bad_row_width_is_rejected():
    with pytest.raises(ValueError):
        build_dataset([MatchRows("x", ["a", "b"], [[1, 64, 1, 0.5]])])


def test_group_folds_never_split_a_match(ds):
    folds = T.group_folds(ds, 5)
    seen = {}
    for i, idx in enumerate(folds):
        for g in np.unique(ds.groups[idx]):
            assert g not in seen, "a match landed in two folds"
            seen[g] = i
    assert sum(len(f) for f in folds) == len(ds.y)


def test_metrics_sane():
    y = np.array([1, 0, 1, 0], float)
    w = np.ones(4)
    perfect = T.metrics(y, np.array([0.999, 0.001, 0.999, 0.001]), w)
    coin = T.metrics(y, np.full(4, 0.5), w)
    assert perfect["logloss"] < 0.01 and perfect["auc"] == 1.0
    assert abs(coin["logloss"] - math.log(2)) < 1e-4 and coin["auc"] == 0.5


def test_exported_trees_match_lightgbm(ds):
    import lightgbm as lgb

    booster = lgb.train({**T.LGBM_PARAMS, "monotone_constraints": [T.MONOTONE.get(f, 0) for f in FEATURES]},
                        lgb.Dataset(ds.X, ds.y, weight=ds.weight, feature_name=FEATURES), 60)
    spec = booster_to_spec(booster, FEATURES)
    idx = np.arange(0, len(ds.y), max(1, len(ds.y) // 300))
    ours = raw_scores(spec, ds.X[idx], FEATURES)
    theirs = booster.predict(ds.X[idx], raw_score=True)
    assert np.allclose(ours, theirs, atol=1e-9)


def test_prior_loads_and_scores(ds):
    prior = T.load_prior()
    p = predict(prior, ds.X, ds.features)
    assert np.all((p > 0) & (p < 1))
    # More T alive (all else equal) never lowers T's chances.
    base = {f: 0.0 for f in FEATURES} | {"t_alive": 4, "ct_alive": 4, "t_hp": 400, "ct_hp": 400, "time_pressure": 0.2}
    rows = []
    for t in range(1, 6):
        s = dict(base, t_alive=t, t_hp=100 * t, alive_diff=t - 4, alive_log_ratio=math.log((t + 0.5) / 4.5))
        rows.append([s[f] for f in FEATURES])
    probs = predict(prior, np.array(rows, float), FEATURES)
    assert np.all(np.diff(probs) > 0)


def test_not_enough_data_keeps_prior():
    small = build_dataset(synthetic_matches(3, rounds=8, seed=4))
    assert T.train(small, T.load_prior(), log=lambda _m: None) is None


def test_training_picks_and_exports_a_model(monkeypatch, ds):
    monkeypatch.setattr(T, "MIN_MATCHES", 10)
    monkeypatch.setattr(T, "MIN_ROUNDS", 100)
    logs = []
    out = T.train(ds, T.load_prior(), log=logs.append)
    assert out is not None
    ev = out["evaluation"]
    assert set(ev["candidates"]) == {"prior", "logistic", "lgbm", "lgbm_mono"}
    for m in ev["candidates"].values():
        assert 0 < m["logloss"] < 1.5 and 0 <= m["ece"] <= 1
    if out["spec"] is not None:
        spec = out["spec"]
        assert "_booster" not in spec
        json.dumps(spec)  # storable
        p = predict(spec, ds.X[:50], ds.features)
        assert np.all(np.isfinite(p))


def test_plain_url_drops_prisma_params():
    assert T._plain_url("postgresql://u:p@h:5432/db?schema=public") == "postgresql://u:p@h:5432/db"
    assert T._plain_url("postgresql://u:p@h/db?sslmode=require&schema=x") == "postgresql://u:p@h/db?sslmode=require"


def test_ts_fixture_is_current():
    """scripts/fixtures/winprob-gbdt.json (the TS scorer's parity fixture) matches LightGBM."""
    data = json.loads(FIXTURE.read_text())
    X = np.array([[math.nan if v is None else v for v in row] for row in data["probes"]], float)
    ours = predict(data["model"], X, data["model"]["features"])
    assert np.allclose(ours, data["expected"], atol=1e-9)
