"""Fit the shipped prior win-probability model to public round statistics.

    python ml/fit_prior.py      # rewrites src/lib/winprob/prior-model.json

The prior is what the app scores with until the trainer has enough of our
own matches to beat it. Its alive-count terms are fitted (weighted least
squares on logits) to published man-advantage conversion rates; the bomb,
clock, economy and HP terms are set by hand from the numbers below, because
no public source separates them cleanly. Every number used is listed in
SOURCES and stored in the JSON, so /admin/ml can show where it comes from.

Sources were collected and cross-checked by two independent research passes
(12.10.2026); values are T win rates.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "src/lib/winprob/prior-model.json"

# (T alive, CT alive) -> T round win rate, bomb status pooled. Pro CS2 where
# available (nomiun 2025 "Big Events", HLTV Rating 3.0 examples), otherwise
# CS:GO matchmaking 2018, ~400k rounds (cryptm.org / Kaggle csgo-matchmaking-damage).
ALIVE = {
    (5, 4): 0.752, (4, 5): 0.30, (5, 3): 0.90, (3, 5): 0.142, (5, 2): 0.977, (2, 5): 0.039,
    (5, 1): 0.998, (1, 5): 0.003, (4, 4): 0.53, (4, 3): 0.764, (3, 4): 0.30, (4, 2): 0.932,
    (2, 4): 0.107, (4, 1): 0.993, (1, 4): 0.015, (3, 3): 0.545, (3, 2): 0.813, (2, 3): 0.267,
    (3, 1): 0.971, (1, 3): 0.058, (2, 2): 0.56, (2, 1): 0.877, (1, 2): 0.214, (1, 1): 0.588,
}
# Round start, pro CS2 2025-26 (TaiZo1, ~32k rounds): CT wins 51.1%.
START_T = 0.489
# The pooled table mixes in post-plant rounds, which lean T (even states sit
# above 50%); before the plant we take this much log-odds off.
PRE_PLANT_SHIFT = -0.25

SOURCES = [
    "Man advantage (alive counts): nomiun.substack.com 'Which Players Win the Most Rounds?' (pro CS2, 2025); "
    "cryptm.org CS:GO MM table (~400k rounds, Kaggle csgo-matchmaking-damage); scope.gg 2026 first-kill conversion (Premier/FACEIT)",
    "Round start: CT 51.1% in tier-1 CS2 2025-26 (TaiZo1, ~32k rounds)",
    "Plant: T ~70% right after the plant in an even mid-round state; ~78-82% expected post-plant in pro gun rounds (HLTV/EDGE 2024)",
    "Economy: full buy vs full eco ~96% (HLTV Rating 3.0 example); eco wins ~3% vs any buy (Xenopoulos et al. 2021)",
    "Clock and defuse race: set by hand (no public source quantifies them); the trained model replaces them",
    "Model form and validation: Xenopoulos, Doraiswamy, Silva, 'Valuing Player Actions in CS:GO' (arXiv 2011.01324)",
]


def logit(p: float) -> float:
    return math.log(p / (1 - p))


def fit_alive() -> tuple[float, float, float]:
    """b0 + w_r * ln((t+.5)/(ct+.5)) + w_d * (t - ct), fitted to the pre-plant logits."""
    rows, target, weight = [], [], []
    for (t, ct), p in ALIVE.items():
        rows.append([1.0, math.log((t + 0.5) / (ct + 0.5)), t - ct])
        target.append(logit(min(max(p, 0.005), 0.995)) + PRE_PLANT_SHIFT)
        # Early-round states (5v4, 4v5, 4v4) matter most; extreme ones are capped above.
        weight.append(2.0 if t + ct >= 8 else 1.0)
    rows.append([1.0, 0.0, 0.0])
    target.append(logit(START_T))
    weight.append(4.0)
    A = np.array(rows) * np.sqrt(np.array(weight))[:, None]
    b = np.array(target) * np.sqrt(np.array(weight))
    coef, *_ = np.linalg.lstsq(A, b, rcond=None)
    return float(coef[0]), float(coef[1]), float(coef[2])


def main() -> None:
    b0, w_ratio, w_diff = fit_alive()

    # Bomb: just planted with plenty of time for the CTs (defuse_margin is capped at 10 s)
    # in an even 4v4 → T ≈ 0.70, i.e. +0.85 log-odds over the same state before the plant;
    # every second CT are short in the defuse race is worth 0.11 log-odds to T
    # (margin −5 s → T ≈ 0.92 in a 4v4).
    w_margin = -0.11
    w_planted = 0.85 - w_margin * 10
    # Seconds short in the defuse race (straight-line running is optimistic, so being
    # short is reliable): 0.4 log-odds per second on top, 8 s short in a 1v2 → T ≈ 0.98.
    w_short = 0.4
    # A defuse under way: T must stop it now.
    w_defusing = -1.0
    # Clock before the plant: time_pressure = 1/(1 + time_left/10). −0.4 at 30 s,
    # −1.5 at 10 s, ≈ −5.8 at 0:00 (T cannot win on time).
    w_tp, w_tp2 = -0.2, -5.6
    # Economy: average equipment per alive player, T − CT, k$. Full (≈ $5k) vs eco
    # (≈ $0.8k) ≈ +3 log-odds ≈ 95%.
    w_equip = 0.7
    # HP: 100 HP missing ≈ half a player at 5v4 (logit(0.75) ≈ 1.1).
    w_hp = 0.0055

    terms = [
        {"f": ["alive_log_ratio"], "w": round(w_ratio, 4)},
        {"f": ["alive_diff"], "w": round(w_diff, 4)},
        {"f": ["t_hp"], "w": w_hp},
        {"f": ["ct_hp"], "w": -w_hp},
        {"f": ["t_alive"], "w": -100 * w_hp},
        {"f": ["ct_alive"], "w": 100 * w_hp},
        {"f": ["equip_avg_diff"], "w": w_equip},
        {"f": ["planted"], "w": round(w_planted, 4)},
        {"f": ["defuse_margin"], "w": w_margin},
        {"f": ["defuse_short"], "w": w_short},
        {"f": ["defusing"], "w": w_defusing},
        {"f": ["time_pressure"], "w": w_tp},
        {"f": ["time_pressure", "time_pressure"], "w": w_tp2},
    ]
    features = sorted({name for t in terms for name in t["f"]})
    spec = {
        "kind": "logistic",
        "features": features,
        "intercept": round(b0, 4),
        "terms": terms,
        # NaN fill: no defuse race before the plant.
        "fill": {"defuse_margin": 0},
        "sources": SOURCES,
    }
    OUT.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    print(f"b0={b0:.3f} w_ratio={w_ratio:.3f} w_diff={w_diff:.3f} -> {OUT}")

    # Fit report: fitted vs target for the alive table (before the plant, full HP, even buys).
    for (t, ct), p in sorted(ALIVE.items(), key=lambda kv: (-kv[0][0], -kv[0][1])):
        z = b0 + w_ratio * math.log((t + 0.5) / (ct + 0.5)) + w_diff * (t - ct)
        print(f"  {t}v{ct}: target {p:.3f} (pre-plant {1 / (1 + math.exp(-(logit(min(max(p, .005), .995)) + PRE_PLANT_SHIFT))):.3f}) fitted {1 / (1 + math.exp(-z)):.3f}")


if __name__ == "__main__":
    main()
