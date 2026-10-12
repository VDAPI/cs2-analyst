"""Synthetic matches for tests: plausible round states whose result follows a
known rule, so the trainer's plumbing (folds, weighting, export, selection)
can be checked without demos. Not used for anything the app shows.
"""
from __future__ import annotations

import math

import numpy as np

from .data import MatchRows

# Same order as WP_FEATURES in src/lib/winprob/features.ts (scripts/test-winprob.ts checks it).
FEATURES = [
    "t_alive", "ct_alive", "alive_diff", "alive_log_ratio", "t_hp", "ct_hp", "t_armor", "ct_armor",
    "t_equip", "ct_equip", "equip_avg_diff", "t_rifles", "ct_rifles", "t_awps", "ct_awps", "time_left",
    "planted", "time_pressure", "defuse_margin", "defuse_short", "defusing", "ct_bomb_dist", "t_bomb_dist", "t_site_dist",
    "ct_site_dist", "t_util_used", "ct_util_used",
]


def _state(rng: np.random.Generator, t_alive: int, ct_alive: int, t_buy: float, ct_buy: float, sec: float, planted: bool, plant_sec: float) -> dict:
    t_hp = sum(rng.integers(20, 101) for _ in range(t_alive))
    ct_hp = sum(rng.integers(20, 101) for _ in range(ct_alive))
    time_left = max(0.0, 40 - (sec - plant_sec)) if planted else max(0.0, 115 - sec)
    ct_bomb = rng.uniform(0.3, 3.0) if planted and ct_alive else math.nan
    margin = max(-20.0, min(10.0, time_left - (ct_bomb * 1000 / 220 + 7.5))) if planted and ct_alive else math.nan
    return {
        "t_alive": t_alive,
        "ct_alive": ct_alive,
        "alive_diff": t_alive - ct_alive,
        "alive_log_ratio": math.log((t_alive + 0.5) / (ct_alive + 0.5)),
        "t_hp": t_hp,
        "ct_hp": ct_hp,
        "t_armor": t_alive if t_buy > 2 else 0,
        "ct_armor": ct_alive if ct_buy > 2 else 0,
        "t_equip": t_buy * t_alive,
        "ct_equip": ct_buy * ct_alive,
        "equip_avg_diff": t_buy - ct_buy,
        "t_rifles": t_alive if t_buy > 3.5 else 0,
        "ct_rifles": ct_alive if ct_buy > 3.5 else 0,
        "t_awps": 1 if t_buy > 4.5 and t_alive else 0,
        "ct_awps": 1 if ct_buy > 4.5 and ct_alive else 0,
        "time_left": time_left,
        "planted": 1 if planted else 0,
        "time_pressure": 0.0 if planted else 1 / (1 + time_left / 10),
        "defuse_margin": margin,
        "defuse_short": (min(20.0, max(0.0, -margin)) if not math.isnan(margin) else 20.0) if planted else 0.0,
        "defusing": 0,
        "ct_bomb_dist": ct_bomb,
        "t_bomb_dist": rng.uniform(0.2, 2.0) if planted and t_alive else math.nan,
        "t_site_dist": math.nan if planted else rng.uniform(0.3, 3.0),
        "ct_site_dist": math.nan if planted else rng.uniform(0.3, 2.5),
        "t_util_used": int(rng.integers(0, 8)),
        "ct_util_used": int(rng.integers(0, 8)),
    }


def truth(s: dict) -> float:
    """The rule results follow (T win probability)."""
    z = 2.6 * s["alive_log_ratio"] + 0.6 * s["equip_avg_diff"] + 0.004 * (s["t_hp"] - s["ct_hp"])
    if s["planted"]:
        z += 1.0 - 0.1 * (0 if math.isnan(s["defuse_margin"]) else s["defuse_margin"])
    else:
        z -= 5 * s["time_pressure"] ** 2
    return 1 / (1 + math.exp(-z))


def synthetic_matches(n_matches: int, rounds: int = 24, seed: int = 1) -> list[MatchRows]:
    rng = np.random.default_rng(seed)
    out = []
    for m in range(n_matches):
        rows = []
        for r in range(1, rounds + 1):
            t_buy = float(rng.choice([0.8, 2.5, 4.2, 5.2]))
            ct_buy = float(rng.choice([0.8, 2.5, 4.4, 5.4]))
            t_alive = ct_alive = 5
            planted = False
            plant_sec = 0.0
            states = []
            for sec in range(0, 115):
                if rng.random() < 0.06 and t_alive and ct_alive:
                    p_t = 0.5 + 0.08 * (t_buy - ct_buy)
                    if rng.random() < p_t:
                        ct_alive -= 1
                    else:
                        t_alive -= 1
                if not planted and t_alive and sec > 30 and rng.random() < 0.03 * t_alive / 5:
                    planted, plant_sec = True, float(sec)
                if t_alive == 0 or ct_alive == 0 or (planted and sec - plant_sec >= 40):
                    break
                states.append((sec, _state(rng, t_alive, ct_alive, t_buy, ct_buy, sec, planted, plant_sec)))
            if not states:
                continue
            # Outcome drawn from the truth at a random mid-round state.
            pick = states[len(states) // 2][1]
            t_win = 1 if rng.random() < truth(pick) else 0
            for sec, s in states:
                rows.append([r, sec * 64, t_win] + [None if (isinstance(s[f], float) and math.isnan(s[f])) else s[f] for f in FEATURES])
        out.append(MatchRows(match_id=f"m{seed}-{m}", features=list(FEATURES), rows=rows))
    return out
