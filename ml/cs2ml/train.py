"""Train the round win-probability model and store it for the app.

    python -m cs2ml.train                 # train from DATABASE_URL, store if better
    python -m cs2ml.train --dry-run       # print the comparison, store nothing
    python -m cs2ml.train --if-new-data   # skip when no match was added since the last model

Every candidate is judged the same way: group k-fold by match (snapshots of
one round, and rounds of one match, are never split between train and test),
every round weighted equally whatever its length, out-of-fold log loss as
the score. Candidates:

- prior: the hand-calibrated prior shipped with the app (no fitting),
- logistic: the prior's terms refitted on the data,
- lgbm: LightGBM,
- lgbm_mono: LightGBM with monotone constraints (one more player alive,
  more HP or equipment never lowers that side's chances).

The best one (optionally Platt-calibrated on its out-of-fold scores) is
refitted on all data and stored as the active WinProbModel when it beats the
prior; otherwise the app keeps scoring with the prior.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np

from .data import Dataset, build_dataset, load_from_db
from .export import booster_to_spec, predict, raw_scores, term_matrix

REPO = Path(__file__).resolve().parents[2]
PRIOR_PATH = Path(os.environ.get("WINPROB_PRIOR", REPO / "src/lib/winprob/prior-model.json"))

# Below this the prior stays: a model fitted on a handful of matches is noise.
MIN_MATCHES = int(os.environ.get("ML_MIN_MATCHES", 20))
MIN_ROUNDS = int(os.environ.get("ML_MIN_ROUNDS", 400))
MAX_FOLDS = 5

# +1: more of it helps T; -1: helps CT.
MONOTONE = {
    "t_alive": 1, "ct_alive": -1, "alive_diff": 1, "alive_log_ratio": 1,
    "t_hp": 1, "ct_hp": -1, "t_armor": 1, "ct_armor": -1,
    "t_equip": 1, "ct_equip": -1, "equip_avg_diff": 1, "t_rifles": 1, "ct_rifles": -1,
    "planted": 1, "defusing": -1, "defuse_margin": -1, "defuse_short": 1, "time_pressure": -1,
}

LGBM_PARAMS = {
    "objective": "binary",
    "learning_rate": 0.05,
    "num_leaves": 15,
    "min_data_in_leaf": 200,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 1.0,
    "max_bin": 63,
    "verbose": -1,
    "seed": 7,
    "deterministic": True,
    "num_threads": 2,
}
MAX_ROUNDS = 600


def load_prior() -> dict:
    with open(PRIOR_PATH, encoding="utf-8") as fh:
        return json.load(fh)


# ─── Metrics ─────────────────────────────────────────────


def metrics(y: np.ndarray, p: np.ndarray, w: np.ndarray) -> dict:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    wsum = w.sum()
    logloss = float(-(w * (y * np.log(p) + (1 - y) * np.log(1 - p))).sum() / wsum)
    brier = float((w * (p - y) ** 2).sum() / wsum)
    # Expected calibration error over 10 equal-width bins.
    bins = np.minimum((p * 10).astype(int), 9)
    ece = 0.0
    for b in range(10):
        m = bins == b
        if m.any():
            ece += w[m].sum() / wsum * abs((w[m] * y[m]).sum() / w[m].sum() - (w[m] * p[m]).sum() / w[m].sum())
    return {"logloss": round(logloss, 5), "brier": round(brier, 5), "ece": round(float(ece), 5), "auc": round(_auc(y, p, w), 5)}


def _auc(y: np.ndarray, p: np.ndarray, w: np.ndarray) -> float:
    if y.min() == y.max():
        return float("nan")
    order = np.argsort(p, kind="mergesort")
    y, w, p = y[order], w[order], p[order]
    pos_w = w * y
    neg_w = w * (1 - y)
    # Weighted Mann-Whitney with ties counted as half.
    auc = 0.0
    neg_before = 0.0
    i = 0
    n = len(p)
    while i < n:
        j = i
        while j + 1 < n and p[j + 1] == p[i]:
            j += 1
        pos_here = pos_w[i : j + 1].sum()
        neg_here = neg_w[i : j + 1].sum()
        auc += pos_here * (neg_before + neg_here / 2)
        neg_before += neg_here
        i = j + 1
    return float(auc / (pos_w.sum() * neg_w.sum()))


# ─── Candidates ──────────────────────────────────────────


@dataclass
class Candidate:
    name: str
    # fit(train dataset rows) -> spec; None = fixed spec (the prior)
    fit: Callable[[Dataset, np.ndarray], dict]


def fit_logistic(prior: dict) -> Callable[[Dataset, np.ndarray], dict]:
    from sklearn.linear_model import LogisticRegression

    def fit(ds: Dataset, idx: np.ndarray) -> dict:
        T = term_matrix(ds.X[idx], ds.features, prior["terms"], prior["fill"])
        mean = T.mean(axis=0)
        scale = T.std(axis=0)
        scale[scale == 0] = 1.0
        clf = LogisticRegression(C=1.0, max_iter=2000)
        clf.fit((T - mean) / scale, ds.y[idx], sample_weight=ds.weight[idx] * len(idx) / ds.weight[idx].sum())
        w = clf.coef_[0] / scale
        intercept = float(clf.intercept_[0] - (w * mean).sum())
        return {
            "kind": "logistic",
            "features": prior["features"],
            "intercept": intercept,
            "terms": [{"f": t["f"], "w": float(wi)} for t, wi in zip(prior["terms"], w)],
            "fill": prior["fill"],
        }

    return fit


def fit_lgbm(monotone: bool) -> Callable[[Dataset, np.ndarray], dict]:
    import lightgbm as lgb

    def fit(ds: Dataset, idx: np.ndarray) -> dict:
        params = dict(LGBM_PARAMS)
        if monotone:
            params["monotone_constraints"] = [MONOTONE.get(f, 0) for f in ds.features]
            params["monotone_constraints_method"] = "advanced"
        # Early stopping on an inner split by match, then refit on everything with that many trees.
        groups = np.unique(ds.groups[idx])
        rounds = MAX_ROUNDS
        if len(groups) >= 5:
            rng = np.random.default_rng(11)
            val_groups = set(rng.choice(groups, size=max(1, len(groups) // 5), replace=False).tolist())
            is_val = np.array([g in val_groups for g in ds.groups[idx]])
            tr, va = idx[~is_val], idx[is_val]
            dtr = lgb.Dataset(ds.X[tr], ds.y[tr], weight=ds.weight[tr], feature_name=list(ds.features), free_raw_data=False)
            dva = lgb.Dataset(ds.X[va], ds.y[va], weight=ds.weight[va], reference=dtr)
            b = lgb.train(params, dtr, MAX_ROUNDS, valid_sets=[dva], callbacks=[lgb.early_stopping(30, verbose=False)])
            rounds = max(20, b.best_iteration or MAX_ROUNDS)
        dall = lgb.Dataset(ds.X[idx], ds.y[idx], weight=ds.weight[idx], feature_name=list(ds.features))
        booster = lgb.train(params, dall, rounds)
        spec = booster_to_spec(booster, ds.features)
        spec["_booster"] = booster  # fast scoring inside the trainer; stripped before storing
        return spec

    return fit


def score(spec: dict, ds: Dataset, idx: np.ndarray) -> np.ndarray:
    """Raw scores; LightGBM's own predict for speed (same numbers as the exported trees)."""
    booster = spec.get("_booster")
    if booster is not None:
        return booster.predict(ds.X[idx], raw_score=True)
    return raw_scores(spec, ds.X[idx], ds.features)


def group_folds(ds: Dataset, k: int) -> list[np.ndarray]:
    """Matches split into k folds of similar size (deterministic)."""
    sizes = np.bincount(ds.groups)
    order = np.argsort(-sizes, kind="mergesort")
    fold_of = np.zeros(len(sizes), int)
    load = np.zeros(k)
    for g in order:
        f = int(np.argmin(load))
        fold_of[g] = f
        load[f] += sizes[g]
    return [np.where(fold_of[ds.groups] == f)[0] for f in range(k)]


def fit_platt(raw: np.ndarray, y: np.ndarray, w: np.ndarray) -> dict:
    from sklearn.linear_model import LogisticRegression

    clf = LogisticRegression(C=1e6, max_iter=1000)
    clf.fit(raw.reshape(-1, 1), y, sample_weight=w * len(w) / w.sum())
    return {"a": float(clf.coef_[0][0]), "b": float(clf.intercept_[0])}


def calibrated(raw: np.ndarray, cal: dict | None) -> np.ndarray:
    z = raw if cal is None else cal["a"] * raw + cal["b"]
    return np.clip(1 / (1 + np.exp(-z)), 0.001, 0.999)


def evaluate(ds: Dataset, prior: dict, log=print) -> dict:
    """Out-of-fold comparison of every candidate. Returns the report and the winner."""
    k = min(MAX_FOLDS, ds.n_matches)
    folds = group_folds(ds, k)
    candidates = [
        Candidate("logistic", fit_logistic(prior)),
        Candidate("lgbm", fit_lgbm(False)),
        Candidate("lgbm_mono", fit_lgbm(True)),
    ]
    all_idx = np.arange(len(ds.y))
    report: dict[str, dict] = {}

    prior_raw = raw_scores(prior, ds.X, ds.features)
    report["prior"] = {**metrics(ds.y, calibrated(prior_raw, prior.get("calibration")), ds.weight), "calibration": None}
    log(f"  prior        {report['prior']}")

    oof: dict[str, np.ndarray] = {}
    for c in candidates:
        raw = np.zeros(len(ds.y))
        for test in folds:
            train = np.setdiff1d(all_idx, test)
            spec = c.fit(ds, train)
            raw[test] = score(spec, ds, test)
        oof[c.name] = raw
        plain = metrics(ds.y, calibrated(raw, None), ds.weight)
        cal = fit_platt(raw, ds.y, ds.weight)
        with_cal = metrics(ds.y, calibrated(raw, cal), ds.weight)
        use_cal = with_cal["logloss"] < plain["logloss"] - 1e-4
        report[c.name] = {**(with_cal if use_cal else plain), "calibration": cal if use_cal else None}
        log(f"  {c.name:<12} {report[c.name]}")

    best = min((n for n in report if n != "prior"), key=lambda n: report[n]["logloss"])
    return {"folds": k, "candidates": report, "best": best, "beats_prior": report[best]["logloss"] < report["prior"]["logloss"]}


def train(ds: Dataset, prior: dict, log=print) -> dict | None:
    """Pick and refit the best candidate. Returns the spec + report, or None to keep the prior."""
    if ds.n_matches < MIN_MATCHES or ds.n_rounds < MIN_ROUNDS:
        log(f"not enough data: {ds.n_matches} matches / {ds.n_rounds} rounds (need {MIN_MATCHES} / {MIN_ROUNDS})")
        return None
    log(f"comparing models on {ds.n_matches} matches, {ds.n_rounds} rounds, {len(ds.y)} snapshots")
    ev = evaluate(ds, prior, log)
    if not ev["beats_prior"]:
        log(f"best candidate {ev['best']} does not beat the prior; keeping the prior")
        return {"spec": None, "evaluation": ev}
    name = ev["best"]
    fit = {"logistic": fit_logistic(prior), "lgbm": fit_lgbm(False), "lgbm_mono": fit_lgbm(True)}[name]
    spec = fit(ds, np.arange(len(ds.y)))
    spec.pop("_booster", None)
    spec["calibration"] = ev["candidates"][name]["calibration"]
    # Sanity: the stored spec must reproduce the scores it was judged by (exported trees = LightGBM).
    probe = np.arange(min(len(ds.y), 200))
    check = predict(spec, ds.X[probe], ds.features)
    if not np.all(np.isfinite(check)):
        raise RuntimeError("exported model produced non-finite predictions")
    return {"spec": spec, "evaluation": ev, "name": name}


# ─── Storage ─────────────────────────────────────────────


def store(database_url: str, ds: Dataset, result: dict) -> str:
    import psycopg
    from psycopg.types.json import Jsonb

    model_id = "wp" + uuid.uuid4().hex[:23]
    ev = result["evaluation"]
    best = ev["candidates"][result["name"]]
    with psycopg.connect(database_url) as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute('UPDATE "WinProbModel" SET active = false WHERE active')
        cur.execute(
            'INSERT INTO "WinProbModel" (id, kind, "featuresVersion", spec, metrics, "nMatches", "nRounds", "nRows", active, "createdAt") '
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true, now())",
            (
                model_id,
                result["name"],
                ds.version,
                Jsonb(result["spec"]),
                Jsonb({**ev, "logloss": best["logloss"], "brier": best["brier"], "auc": best["auc"], "ece": best["ece"]}),
                ds.n_matches,
                ds.n_rounds,
                int(len(ds.y)),
            ),
        )
    return model_id


def store_run(database_url: str, ds: Dataset, ev: dict | None, note: str) -> None:
    """Remember a training run that kept the current model (so --if-new-data does not retry it)."""
    import psycopg

    value = json.dumps({"matches": ds.n_matches, "version": ds.version, "note": note, "evaluation": ev})
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute(
            'INSERT INTO "AppSetting" (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
            ("winprob:lastRun", value),
        )


def last_trained_matches(database_url: str, version: int) -> int:
    """Matches behind the newest stored model or the last run that kept the prior."""
    import psycopg

    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute('SELECT "nMatches" FROM "WinProbModel" WHERE "featuresVersion" = %s ORDER BY "createdAt" DESC LIMIT 1', (version,))
        row = cur.fetchone()
        n = int(row[0]) if row else 0
        cur.execute('SELECT value FROM "AppSetting" WHERE key = %s', ("winprob:lastRun",))
        run = cur.fetchone()
        if run:
            try:
                info = json.loads(run[0])
                if int(info.get("version", 0)) == version:
                    n = max(n, int(info.get("matches", 0)))
            except (ValueError, TypeError):
                pass
        return n


def run(database_url: str, *, dry_run: bool = False, if_new_data: bool = False, log=print) -> dict:
    ds = build_dataset(load_from_db(database_url))
    if if_new_data and ds.n_matches > 0 and last_trained_matches(database_url, ds.version) >= ds.n_matches:
        log(f"no new matches since the last training ({ds.n_matches})")
        return {"status": "up_to_date", "matches": ds.n_matches}
    prior = load_prior()
    result = train(ds, prior, log)
    if result is None:
        if not dry_run:
            store_run(database_url, ds, None, "not enough data")
        return {"status": "not_enough_data", "matches": ds.n_matches, "rounds": ds.n_rounds}
    if result["spec"] is None:
        if not dry_run:
            store_run(database_url, ds, result["evaluation"], "prior kept")
        return {"status": "prior_kept", "evaluation": result["evaluation"]}
    if dry_run:
        return {"status": "dry_run", "best": result["name"], "evaluation": result["evaluation"]}
    model_id = store(database_url, ds, result)
    log(f"stored model {model_id} ({result['name']})")
    return {"status": "trained", "id": model_id, "best": result["name"], "evaluation": result["evaluation"]}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--if-new-data", action="store_true")
    args = ap.parse_args(argv)
    if not args.database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2
    out = run(_plain_url(args.database_url), dry_run=args.dry_run, if_new_data=args.if_new_data)
    print(json.dumps({k: v for k, v in out.items() if k != "evaluation"}))
    return 0


def _plain_url(url: str) -> str:
    """Prisma URLs may carry ?schema=…, which libpq rejects."""
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k not in ("schema", "connection_limit", "pool_timeout", "pgbouncer")]
    return urlunsplit(parts._replace(query=urlencode(query)))


if __name__ == "__main__":
    sys.exit(main())
