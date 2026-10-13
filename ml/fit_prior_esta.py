"""Fit the shipped prior win-probability model on the ESTA pro dataset.

    python ml/fit_prior_esta.py <snapshot dir>   # rewrites src/lib/winprob/prior-model.json

ESTA ("Esports Trajectories and Actions", Xenopoulos et al., github.com/pnxenopoulos/esta,
CC BY-SA 4.0) holds 1,558 parsed pro CS:GO demos (2021-22). The round rules the
model sees are the same in CS2 (1:55 clock, 40 s bomb, 5/10 s defuse), so it is a
far better start than hand-set numbers; once the app has enough CS2 matches of its
own, the trainer replaces it (it must beat this prior on them).

The snapshot dir holds one JSON per match, {matchId, version, features, rows},
built with the app's own feature code (src/lib/winprob/features.ts):

    python ml/esta/to_wp.py <esta .json.xz dir> <WpMatch dir>
    npx tsx --tsconfig tsconfig.json scripts/esta-snapshots.ts <WpMatch dir> <snapshot dir>

The prior stays a logistic model on a few robust terms (a CS:GO-fitted tree model
would also learn what changed in CS2: utility, weapons, economy). 20% of the
matches are held out and the fit is reported on them before the final fit on all.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cs2ml import train as T  # noqa: E402
from cs2ml.data import MatchRows, build_dataset  # noqa: E402
from cs2ml.export import raw_scores, term_matrix  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "src/lib/winprob/prior-model.json"

# The model's terms: a feature, or a product of features. Kept monotone where a
# revived player must help their side (checked by npm run test:winprob).
TERMS = [
    ["alive_log_ratio"],
    ["alive_diff"],
    ["t_hp"],
    ["ct_hp"],
    ["t_alive"],
    ["ct_alive"],
    ["equip_avg_diff"],
    # Equipment decides most at the start of the round, before anyone has died.
    ["equip_avg_diff", "time_left"],
    ["planted"],
    ["planted", "alive_log_ratio"],
    ["defuse_margin"],
    ["defuse_short"],
    ["defusing"],
    ["time_pressure"],
    ["time_pressure", "time_pressure"],
    ["time_pressure", "alive_log_ratio"],
]
# NaN fill: no defuse race before the plant.
FILL = {"defuse_margin": 0}

SOURCES = [
    "Fitted on ESTA (Esports Trajectories and Actions): {matches} pro CS:GO matches, {rounds} rounds, 2021-22 "
    "(P. Xenopoulos, C. Silva et al., github.com/pnxenopoulos/esta, CC BY-SA 4.0); same round rules as CS2",
    "Held-out check (20% of the matches): log loss {logloss}, AUC {auc}, calibration error {ece}",
    "Replaced by a model trained on this site's own CS2 matches once one beats it on them",
    "Model form and validation: Xenopoulos, Doraiswamy, Silva, 'Valuing Player Actions in CS:GO' (arXiv 2011.01324)",
]


def load(dir_: str) -> list[MatchRows]:
    out = []
    for f in sorted(os.listdir(dir_)):
        d = json.load(open(os.path.join(dir_, f), encoding="utf-8"))
        out.append(MatchRows(d["matchId"], list(d["features"]), d["rows"], True, int(d["version"])))
    return out


def fit(ds, idx: np.ndarray) -> dict:
    """Weighted logistic regression (every round weighs 1) on the terms; almost no regularisation."""
    from sklearn.linear_model import LogisticRegression

    terms = [{"f": t, "w": 0.0} for t in TERMS]
    M = term_matrix(ds.X[idx], ds.features, terms, FILL)
    mean, scale = M.mean(axis=0), M.std(axis=0)
    scale[scale == 0] = 1.0
    clf = LogisticRegression(C=100.0, max_iter=5000)
    clf.fit((M - mean) / scale, ds.y[idx], sample_weight=T.unit_weights(ds, idx))
    w = clf.coef_[0] / scale
    return {
        "kind": "logistic",
        "features": sorted({name for t in TERMS for name in t}),
        "intercept": round(float(clf.intercept_[0] - (w * mean).sum()), 5),
        "terms": [{"f": t, "w": round(float(wi), 5)} for t, wi in zip(TERMS, w)],
        "fill": FILL,
    }


def calibration_table(y, p, w) -> list[str]:
    lines = []
    for lo in np.arange(0, 1, 0.1):
        m = (p >= lo) & (p < lo + 0.1)
        if m.any():
            lines.append(
                f"  {lo:.1f}-{lo + 0.1:.1f}: predicted {np.average(p[m], weights=w[m]):.3f} "
                f"actual {np.average(y[m], weights=w[m]):.3f} share {w[m].sum() / w.sum():.3f}"
            )
    return lines


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    matches = load(sys.argv[1])
    order = np.random.default_rng(0).permutation(len(matches))
    n_test = len(matches) // 5
    test = build_dataset([matches[i] for i in order[:n_test]])
    train = build_dataset([matches[i] for i in order[n_test:]])
    old = json.load(open(OUT, encoding="utf-8"))

    spec = fit(train, np.arange(len(train.y)))
    report = {}
    for name, s in (("previous prior", old), ("refitted", spec)):
        p = T.calibrated(raw_scores(s, test.X, test.features), None)
        report[name] = T.metrics(test.y, p, test.weight)
        print(f"{name}: {report[name]}")
        print("\n".join(calibration_table(test.y, p, test.weight)))

    full = build_dataset(matches)
    final = fit(full, np.arange(len(full.y)))
    held = report["refitted"]
    final["sources"] = [
        s.format(matches=full.n_matches, rounds=full.n_rounds, logloss=held["logloss"], auc=held["auc"], ece=held["ece"])
        for s in SOURCES
    ]
    OUT.write_text(json.dumps(final, indent=2) + "\n", encoding="utf-8")
    print(f"{full.n_matches} matches, {full.n_rounds} rounds -> {OUT}")


if __name__ == "__main__":
    main()
