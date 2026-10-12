"""Write scripts/fixtures/winprob-gbdt.json: a small LightGBM model exported the
way the trainer exports it, probe rows (with NaNs) and LightGBM's own
predictions for them. `npm run test:winprob` checks the TypeScript scorer
against it; `pytest` checks the fixture is still what LightGBM says.

    cd ml && python make_fixture.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import lightgbm as lgb
import numpy as np

from cs2ml import train as T
from cs2ml.data import build_dataset
from cs2ml.export import booster_to_spec
from cs2ml.synthetic import FEATURES, synthetic_matches

OUT = Path(__file__).resolve().parents[1] / "scripts/fixtures/winprob-gbdt.json"


def main() -> None:
    ds = build_dataset(synthetic_matches(12, rounds=12, seed=21))
    params = {**T.LGBM_PARAMS, "min_data_in_leaf": 40, "monotone_constraints": [T.MONOTONE.get(f, 0) for f in FEATURES]}
    booster = lgb.train(params, lgb.Dataset(ds.X, ds.y, weight=ds.weight, feature_name=FEATURES), 40)
    spec = booster_to_spec(booster, FEATURES)
    spec["calibration"] = {"a": 0.9, "b": 0.05}
    rng = np.random.default_rng(5)
    idx = rng.choice(len(ds.y), size=60, replace=False)
    probes = ds.X[idx].copy()
    # Extra NaNs in columns that are never missing in training: LightGBM treats them as 0.
    probes[:5, 0] = np.nan
    probes[5:10, FEATURES.index("t_hp")] = np.nan
    raw = booster.predict(probes, raw_score=True)
    expected = np.clip(1 / (1 + np.exp(-(0.9 * raw + 0.05))), 0.001, 0.999)
    OUT.write_text(
        json.dumps(
            {
                "model": spec,
                "probes": [[None if math.isnan(v) else float(v) for v in row] for row in probes],
                "expected": [float(v) for v in expected],
            }
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{len(spec['trees'])} trees, {len(probes)} probes -> {OUT}")


if __name__ == "__main__":
    main()
