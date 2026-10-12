/**
 * Lineup trainer (S22): which lineups from the learned base (S11, lineups.ts)
 * a player should practise — the ones that land where his flagged grenade
 * went (smoke too early / into the void, molotov without effect, lineup off
 * target), and the day's not-yet-mastered lineups. Pure, covered by
 * `npm run test:training`.
 */
import { matchLineup, suggestLineup, type Lineup } from "@/lib/analysis/lineups";
import type { GrenadeKind, UtilityThrow } from "@/lib/analysis/utility";

/** Finding types whose moment is one grenade landing; their cards link to the trainer. */
export const LINEUP_FINDING_TYPES = ["smoke_early", "smoke_void", "lineup_miss", "molotov_no_effect"] as const;

/** Shape of Lineup.key ("SMOKE:jump:-12:40:3:-18"), checked before a mastery mark is stored. */
export const LINEUP_KEY_RE = /^(SMOKE|FLASH|MOLOTOV|HE|DECOY):(stand|walk|run|jump)(:-?\d+){4}$/;

export function hasLineupPractice(type: string): boolean {
  return (LINEUP_FINDING_TYPES as readonly string[]).includes(type);
}

const GRENADES_OF: Record<string, GrenadeKind[]> = {
  smoke_early: ["SMOKE"],
  smoke_void: ["SMOKE"],
  molotov_no_effect: ["MOLOTOV"],
  lineup_miss: ["SMOKE", "MOLOTOV"],
};

/** A lineup this far from the flagged landing still covers "the same spot" (2D units). */
export const PRACTICE_RANGE = 600;
/** Lineups landing this close to a void smoke/no-effect molotov are the same throw again. */
const SAME_SPOT = 110;
/** Ticks of slack between the finding's tick and the throw's detonation. */
const TICK_SLACK = 16;
export const MAX_PRACTICE = 3;

/** The throw a finding is about: same round, its detonation at the finding's tick. */
export function throwForFinding(
  throws: UtilityThrow[],
  f: { type: string; roundNumber: number; tick: number }
): UtilityThrow | null {
  const kinds = GRENADES_OF[f.type];
  if (!kinds) return null;
  let best: UtilityThrow | null = null;
  for (const t of throws) {
    if (t.roundNumber !== f.roundNumber || !kinds.includes(t.type)) continue;
    const off = Math.abs(t.detTick - f.tick);
    if (off > TICK_SLACK) continue;
    if (!best || off < Math.abs(best.detTick - f.tick)) best = t;
  }
  return best;
}

export interface LineupPick {
  lineup: Lineup;
  /** Distance between the lineup's landing and the player's (2D units). */
  offBy: number;
  /**
   * target: the lineup the player was going for (lineup_miss);
   * same_spot: the same spot, thrown at the right moment (smoke too early);
   * nearby: another lineup covering the area.
   */
  reason: "target" | "same_spot" | "nearby";
}

const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Lineups to practise instead of the flagged throw, best first. The player's
 * side must be able to throw them; a void smoke or a molotov without effect
 * doesn't get the very same throw suggested back.
 */
export function practiceLineups(t: UtilityThrow, findingType: string, lineups: Lineup[], max = MAX_PRACTICE): LineupPick[] {
  const own = matchLineup(t, lineups);
  const out: LineupPick[] = [];
  const seen = new Set<string>();
  const push = (p: LineupPick) => {
    if (seen.has(p.lineup.key) || out.length >= max) return;
    seen.add(p.lineup.key);
    out.push(p);
  };

  if (findingType === "lineup_miss") {
    const hint = suggestLineup(t, lineups);
    if (hint) push({ lineup: hint.lineup, offBy: hint.offBy, reason: "target" });
  }
  const repeatOk = findingType === "smoke_early" || findingType === "lineup_miss";
  const near = lineups
    .filter((l) => l.type === t.type && (l.side === "both" || l.side === t.side) && Math.abs(l.land.z - t.land.z) <= 200)
    .map((l) => ({ l, off: Math.round(d2(l.land, t.land)) }))
    .filter(({ l, off }) => off <= PRACTICE_RANGE && (repeatOk || (l.key !== own?.key && off > SAME_SPOT)))
    .sort((a, b) => a.off - b.off || b.l.samples - a.l.samples);
  for (const { l, off } of near) {
    push({ lineup: l, offBy: off, reason: off <= SAME_SPOT || l.key === own?.key ? "same_spot" : "nearby" });
  }
  return out;
}

/**
 * Lineups for today's routine: not mastered yet, of the day's grenade types,
 * for the player's side when known; most thrown first.
 */
export function routineLineups(
  lineups: Lineup[],
  mastered: ReadonlySet<string>,
  o: { types: GrenadeKind[]; side?: "CT" | "T" | null; max?: number }
): Lineup[] {
  if (o.types.length === 0) return [];
  const rank = (ty: GrenadeKind) => o.types.indexOf(ty);
  return lineups
    .filter((l) => o.types.includes(l.type) && !mastered.has(l.key) && (!o.side || l.side === "both" || l.side === o.side))
    .sort((a, b) => rank(a.type) - rank(b.type) || b.samples - a.samples || a.key.localeCompare(b.key))
    .slice(0, o.max ?? MAX_PRACTICE);
}

/** Share of a map's lineups the player has mastered (0–100, rounded). */
export function masteryPercent(lineups: Pick<Lineup, "key">[], mastered: ReadonlySet<string>): number {
  if (lineups.length === 0) return 0;
  return Math.round((lineups.filter((l) => mastered.has(l.key)).length / lineups.length) * 100);
}
