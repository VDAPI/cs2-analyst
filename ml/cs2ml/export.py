"""Model specs shared with the TypeScript scorer (src/lib/winprob/model.ts).

- gbdt: LightGBM's dump_model() flattened into per-tree arrays.
- logistic: intercept + weighted terms (a feature or a product of features),
  NaN filled per feature. The shipped prior (src/lib/winprob/prior-model.json)
  has this shape.

`score_spec` mirrors the TypeScript scorer, so the trainer evaluates exactly
what the app will run, and the parity test can compare both against
LightGBM's own predictions.
"""
from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np

ZERO = 1e-35
MISSING = {"None": 0, "Zero": 1, "NaN": 2}


def booster_to_spec(booster: Any, features: Sequence[str]) -> dict:
    dump = booster.dump_model()
    names = dump.get("feature_names") or list(features)
    if list(names) != list(features):
        raise ValueError(f"feature order mismatch: {names} vs {features}")
    trees = []
    for info in dump["tree_info"]:
        trees.append(_flatten(info["tree_structure"]))
    return {"kind": "gbdt", "features": list(features), "trees": trees}


def _flatten(root: dict) -> dict:
    t = {"f": [], "t": [], "l": [], "r": [], "d": [], "m": [], "v": []}
    if "leaf_value" in root and "split_feature" not in root:
        t["v"].append(float(root["leaf_value"]))
        return t

    def visit(node: dict) -> int:
        if "split_feature" not in node:
            t["v"].append(float(node["leaf_value"]))
            return ~(len(t["v"]) - 1)
        if node.get("decision_type", "<=") != "<=":
            raise ValueError("categorical splits are not supported")
        i = len(t["f"])
        t["f"].append(int(node["split_feature"]))
        t["t"].append(float(node["threshold"]))
        t["d"].append(1 if node.get("default_left") else 0)
        t["m"].append(MISSING[node.get("missing_type", "None")])
        t["l"].append(0)
        t["r"].append(0)
        t["l"][i] = visit(node["left_child"])
        t["r"][i] = visit(node["right_child"])
        return i

    visit(root)
    return t


def _tree_value(tree: dict, x: np.ndarray) -> float:
    if not tree["f"]:
        return tree["v"][0]
    node = 0
    while True:
        v = x[tree["f"][node]]
        missing = tree["m"][node]
        if math.isnan(v) and missing != 2:
            v = 0.0
        if (missing == 1 and abs(v) <= ZERO) or (missing == 2 and math.isnan(v)):
            left = tree["d"][node] == 1
        else:
            left = v <= tree["t"][node]
        nxt = tree["l"][node] if left else tree["r"][node]
        if nxt < 0:
            return tree["v"][~nxt]
        node = nxt


def term_matrix(X: np.ndarray, features: Sequence[str], terms: Sequence[dict], fill: dict[str, float]) -> np.ndarray:
    """Columns of a logistic spec's terms (products of NaN-filled features)."""
    index = {name: j for j, name in enumerate(features)}
    cols = []
    for term in terms:
        col = np.ones(len(X))
        for name in term["f"]:
            v = X[:, index[name]].copy()
            v[np.isnan(v)] = fill.get(name, 0.0)
            col = col * v
        cols.append(col)
    return np.column_stack(cols) if cols else np.zeros((len(X), 0))


def raw_scores(spec: dict, X: np.ndarray, features: Sequence[str]) -> np.ndarray:
    """Raw log-odds of P(T wins) for every row of X (columns named by `features`)."""
    index = {name: j for j, name in enumerate(features)}
    cols = [index.get(name) for name in spec["features"]]
    Xs = np.column_stack([X[:, c] if c is not None else np.full(len(X), np.nan) for c in cols]) if cols else X[:, :0]
    if spec["kind"] == "gbdt":
        out = np.zeros(len(X))
        for i in range(len(X)):
            out[i] = sum(_tree_value(tree, Xs[i]) for tree in spec["trees"])
        return out
    if spec["kind"] == "logistic":
        T = term_matrix(Xs, spec["features"], spec["terms"], spec.get("fill", {}))
        w = np.array([term["w"] for term in spec["terms"]])
        return spec["intercept"] + (T @ w if len(w) else 0.0)
    raise ValueError(f"unknown model kind {spec['kind']}")


def predict(spec: dict, X: np.ndarray, features: Sequence[str]) -> np.ndarray:
    raw = raw_scores(spec, X, features)
    cal = spec.get("calibration")
    if cal:
        raw = cal["a"] * raw + cal["b"]
    p = 1.0 / (1.0 + np.exp(-raw))
    return np.clip(p, 0.001, 0.999)
