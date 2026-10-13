/**
 * What a mistake cost the team, in percentage points of round win
 * probability (S14): "kosztowało team X pp szansy na rundę".
 *
 * The cost is measured on what actually followed the mistake, never guessed:
 * - "death": the player died in the moments after it (the duel the mistake
 *   lost) → WP right after the death vs. the same moment with the player
 *   still alive (so a kill on the same tick is not counted in).
 * - "mate_death": a team flash whose blinded player was then hit → same, on
 *   the first kill by that enemy on the thrower's team in the next seconds.
 * - "trade": a missed trade → WP when the trade window closed vs. the same
 *   moment had the killer been traded (and not got the kills he got after).
 * - "drop": no drop → WP at freeze end vs. the same with the broke teammate
 *   holding a rifle.
 * Losing a player, a trade or a rifle never helps a team; where a trained
 * model says otherwise (it only knows the states it saw) the cost is 0.
 * Types without a rule (timing of a smoke, a predictable spot, a force buy
 * whose cost is in the next round) get no number rather than a made-up one.
 *
 * Pure module, covered by `npm run test:winprob`.
 */
import { FINDING_TYPES, type FindingType } from "@/lib/findings/catalog";
import { otherSide, stateAt, type Counterfactual, type RoundContext, type Side } from "./features";
import { predictSide, type WinProbModelSpec } from "./model";

/** Bump when how a cost is measured changes: stored findings are rebuilt. */
export const IMPACT_VERSION = 2;

export type ImpactKind = "death" | "mate_death" | "trade" | "drop";

const DEATH_TYPES: FindingType[] = [
  "moving_shot",
  "late_strafe",
  "spray",
  "air_shot",
  "crosshair",
  "reaction",
  "ttd",
  "overflick",
  "preaim",
  "dry_peek",
  "reload",
  "noise",
  "jump",
  "flash_blind",
  "death_with_utility",
  "untraded_death",
  "entry_death",
  "lurk_death",
  "postplant_death",
  "retake_solo",
  "clutch_decision",
  "isolated_aggression",
];

export const IMPACT_RULE: Partial<Record<FindingType, ImpactKind>> = {
  ...Object.fromEntries(DEATH_TYPES.filter((t) => t in FINDING_TYPES).map((t) => [t, "death" as const])),
  team_flash: "mate_death",
  missed_trade: "trade",
  no_drop: "drop",
};

/** A death this long before the moment still belongs to it (frame rounding). */
const BEFORE_SLACK_S = 0.5;
/** …and this long after the clip window. */
const AFTER_SLACK_S = 1;
/** Mate deaths after a team flash count within this window. */
const MATE_WINDOW_S = 4;
/** The trade window (tactics.ts TRADE_WINDOW_S). */
const TRADE_WINDOW_S = 3;
/** A broke teammate's rifle, roughly (AK $2700 / M4 $2900 + armour already counted). */
const DROP_VALUE: Record<Side, number> = { T: 2700, CT: 2900 };

export interface ImpactTarget {
  type: string;
  steamId: string;
  roundNumber: number;
  tick: number;
  targetSteamId: string | null;
}

export interface Impact {
  kind: ImpactKind;
  /** Team's win probability before / after (or actual vs. counterfactual), 0–1. */
  before: number;
  after: number;
  /** Tick the impact is measured at. */
  tick: number;
}

/** after − before in percentage points, one decimal. */
export const impactPp = (i: Pick<Impact, "before" | "after">) => Math.round((i.after - i.before) * 1000) / 10;

export function findingImpact(
  f: ImpactTarget,
  ctx: RoundContext | undefined,
  model: WinProbModelSpec
): Impact | null {
  const kind = IMPACT_RULE[f.type as FindingType];
  if (!kind || !ctx || ctx.frames.length === 0) return null;
  const side = ctx.sideOf.get(f.steamId);
  if (!side) return null;
  const tr = ctx.tickRate;
  const wp = (tick: number, cf?: Counterfactual) => predictSide(model, stateAt(ctx, tick, cf), side);
  const clip = FINDING_TYPES[f.type as FindingType]?.clip ?? { before: 3, after: 1.5 };

  /**
   * What one death cost: WP right after it vs. the same moment with that
   * player still alive, so a kill on the same tick (a trade, a double) is not
   * mixed into it.
   */
  const acrossDeath = (k: ImpactKind, victim: string, deathTick: number): Impact | null => {
    if (deathTick <= ctx.freezeEnd || deathTick > ctx.decided) return null;
    const alive = wp(deathTick, { revive: [victim] });
    return { kind: k, before: alive, after: Math.min(alive, wp(deathTick)), tick: deathTick };
  };

  switch (kind) {
    case "death": {
      const d = ctx.deathTick.get(f.steamId);
      if (d == null) return null;
      if (d < f.tick - BEFORE_SLACK_S * tr || d > f.tick + (clip.after + AFTER_SLACK_S) * tr) return null;
      return acrossDeath("death", f.steamId, d);
    }
    case "mate_death": {
      // Only a kill by the enemy who hit a blinded teammate (the finding's target), the thrower included.
      const punisher = f.targetSteamId;
      if (!punisher) return null;
      const k = ctx.round.kills
        .filter(
          (x) =>
            x.attackerSteamId === punisher &&
            ctx.sideOf.get(x.victimSteamId) === side &&
            x.tick >= f.tick &&
            x.tick <= f.tick + MATE_WINDOW_S * tr
        )
        .sort((a, b) => a.tick - b.tick)[0];
      return k ? acrossDeath("mate_death", k.victimSteamId, k.tick) : null;
    }
    case "trade": {
      const killer = f.targetSteamId;
      if (!killer || ctx.sideOf.get(killer) !== otherSide(side)) return null;
      const at = Math.min(f.tick + TRADE_WINDOW_S * tr, ctx.decided);
      if (at <= ctx.freezeEnd) return null;
      // Had the killer been traded, his later kills (until `at`) would not have happened.
      const laterVictims = ctx.round.kills
        .filter((k) => k.attackerSteamId === killer && k.tick > f.tick && k.tick <= at)
        .map((k) => k.victimSteamId);
      const actual = wp(at);
      const traded = wp(at, { kill: [killer], revive: laterVictims });
      return { kind, before: traded, after: Math.min(traded, actual), tick: at };
    }
    case "drop": {
      const mates = [...ctx.sideOf.entries()]
        .filter(([id, s]) => s === side && id !== f.steamId)
        .map(([id]) => ({ id, equip: ctx.round.equip[id] ?? 0 }))
        .sort((a, b) => a.equip - b.equip);
      const mate = mates[0];
      if (!mate || mate.equip >= 2000) return null;
      const at = ctx.freezeEnd;
      const actual = wp(at);
      const dropped = wp(at, { addEquip: { [mate.id]: DROP_VALUE[side] }, addRifle: [mate.id] });
      return { kind, before: dropped, after: Math.min(dropped, actual), tick: at };
    }
  }
}
