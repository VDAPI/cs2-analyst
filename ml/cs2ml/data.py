"""Training data for the round win-probability model.

The Node side (src/lib/winprob/persist.ts) stores one WinProbData row per
analysed match: the feature names and every snapshot as
[roundNumber, tick, tWin, feature...] with null for "does not apply". This
module turns those rows into numpy arrays; it never parses demos itself, so
the features have exactly one implementation (src/lib/winprob/features.ts).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

import numpy as np


@dataclass
class MatchRows:
    match_id: str
    features: list[str]
    rows: list[list[float | None]]
    pro: bool = False
    version: int = 1


@dataclass
class Dataset:
    features: list[str]
    X: np.ndarray  # (n, F) float64, NaN = not applicable
    y: np.ndarray  # (n,) 1 = T won the round
    groups: np.ndarray  # (n,) match index, for group k-fold
    rounds: np.ndarray  # (n,) round index across the dataset
    weight: np.ndarray  # (n,) every round sums to 1
    match_ids: list[str] = field(default_factory=list)
    version: int = 1

    @property
    def n_matches(self) -> int:
        return len(self.match_ids)

    @property
    def n_rounds(self) -> int:
        return int(len(np.unique(self.rounds))) if len(self.rounds) else 0


def build_dataset(matches: Iterable[MatchRows]) -> Dataset:
    """Stack matches that share the newest feature version and feature list."""
    matches = [m for m in matches if m.rows]
    if not matches:
        return Dataset([], np.zeros((0, 0)), np.zeros(0), np.zeros(0, int), np.zeros(0, int), np.zeros(0))
    version = max(m.version for m in matches)
    matches = [m for m in matches if m.version == version]
    features = matches[0].features
    matches = [m for m in matches if m.features == features]

    xs, ys, gs, rs = [], [], [], []
    round_index = 0
    for gi, m in enumerate(matches):
        arr = np.array([[np.nan if v is None else float(v) for v in row] for row in m.rows], dtype=np.float64)
        if arr.ndim != 2 or arr.shape[1] != 3 + len(features):
            raise ValueError(f"match {m.match_id}: expected {3 + len(features)} columns, got {arr.shape}")
        round_numbers = arr[:, 0].astype(int)
        _, inverse = np.unique(round_numbers, return_inverse=True)
        xs.append(arr[:, 3:])
        ys.append(arr[:, 2])
        gs.append(np.full(len(arr), gi))
        rs.append(inverse + round_index)
        round_index += int(inverse.max()) + 1
    X = np.vstack(xs)
    y = np.concatenate(ys)
    groups = np.concatenate(gs)
    rounds = np.concatenate(rs)
    counts = np.bincount(rounds)
    weight = 1.0 / counts[rounds]
    return Dataset(features, X, y, groups, rounds, weight, [m.match_id for m in matches], version)


def load_from_db(database_url: str) -> list[MatchRows]:
    """Every stored snapshot set (pro and player matches alike: game state → result is the same game)."""
    import psycopg

    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute('SELECT "matchId", version, pro, features, rows FROM "WinProbData"')
        return [
            MatchRows(match_id=mid, version=int(ver), pro=bool(pro), features=list(feats), rows=list(rows))
            for mid, ver, pro, feats, rows in cur.fetchall()
        ]


def fill_columns(X: np.ndarray, features: Sequence[str], fill: dict[str, float]) -> np.ndarray:
    """NaN → the model's fill value per feature (logistic models only)."""
    out = X.copy()
    for j, name in enumerate(features):
        col = out[:, j]
        col[np.isnan(col)] = fill.get(name, 0.0)
    return out
