/**
 * Highlights (S25): the rounds worth a clip — won clutches and multi-kills
 * (3K, 4K, ace) — with the tick window the 2D clip shows. Pure, covered by
 * `npm run test:social`.
 *
 * Sides are per round (`sideAt`, from createSideResolver): a clutch is judged
 * against the side the players actually played that round, the same way the
 * match page's clutch list is (detectClutches).
 */
import type { Side } from "@/lib/utils/sideSplit";
import { MAX_CLIP_SECONDS } from "./clip";

export type HighlightKind = "clutch" | "ace" | "4k" | "3k";

export interface HighlightKill {
  tick: number;
  attackerSteamId: string;
  victimSteamId: string;
  weapon: string;
  headshot: boolean;
}

export interface HighlightRound {
  number: number;
  startTick: number;
  endTick: number;
  winner: Side;
  kills: HighlightKill[];
}

export interface HighlightInput {
  rounds: HighlightRound[];
  /** Side each player finished the match on (MatchPlayer.team). */
  finalTeamBySteamId: Map<string, Side>;
  /** Side a player with that final side played in a round. */
  sideAt: (finalSide: Side, roundNumber: number) => Side;
  tickRate?: number;
}

export interface Highlight {
  /** Stable within a match: "<round>-<steamId>". */
  key: string;
  kind: HighlightKind;
  steamId: string;
  side: Side;
  round: number;
  /** Clutch size (1vN) when the round was a won clutch. */
  clutch: number | null;
  /** The player's kills in the round (team kills excluded). */
  kills: number;
  headshots: number;
  weapons: string[];
  /** Clip window, ticks. */
  from: number;
  to: number;
  /** Where the clip "is about" (last kill, or the start of a clutch without kills). */
  focus: number;
  /** Kill ticks inside the window, marked on the clip's timeline. */
  marks: number[];
  /** Ranking among highlights: higher = better clip. */
  score: number;
}

/** Seconds of the clip before the first kill (or the start of the clutch). */
export const HIGHLIGHT_LEAD_S = 3;
/** Seconds after the last kill. */
export const HIGHLIGHT_TAIL_S = 2.5;
/** A clutch won without a kill (bomb, time) shows this much after it started. */
const QUIET_CLUTCH_S = 15;

const MULTI_SCORE: Record<number, number> = { 3: 40, 4: 70, 5: 100 };
const CLUTCH_SCORE: Record<number, number> = { 1: 35, 2: 60, 3: 80, 4: 95, 5: 120 };

export function multiKind(kills: number): HighlightKind | null {
  if (kills >= 5) return "ace";
  if (kills === 4) return "4k";
  if (kills === 3) return "3k";
  return null;
}

export function highlightScore(kills: number, clutch: number | null): number {
  const multi = MULTI_SCORE[Math.min(5, kills)] ?? 0;
  const cl = clutch ? CLUTCH_SCORE[Math.min(5, clutch)] ?? 0 : 0;
  // A combined highlight (a 1v3 won with 3 kills) beats either alone.
  return Math.max(multi, cl) + (multi && cl ? 15 : 0) + Math.min(kills, 5);
}

interface RoundClutch {
  steamId: string;
  side: Side;
  size: number;
  startTick: number;
}

/** The first moment one side is down to one player while the other still has someone (mirrors detectClutches). */
function clutchOf(round: HighlightRound, sideOf: Map<string, Side>): RoundClutch | null {
  const alive: Record<Side, Set<string>> = { CT: new Set(), T: new Set() };
  for (const [id, side] of sideOf) alive[side].add(id);
  const kills = [...round.kills].sort((a, b) => a.tick - b.tick);
  for (const k of kills) {
    const v = sideOf.get(k.victimSteamId);
    if (v) alive[v].delete(k.victimSteamId);
    const ct = alive.CT.size;
    const t = alive.T.size;
    if (ct === 1 && t >= 1) return { steamId: [...alive.CT][0], side: "CT", size: t, startTick: k.tick };
    if (t === 1 && ct >= 1) return { steamId: [...alive.T][0], side: "T", size: ct, startTick: k.tick };
  }
  return null;
}

/** Window of a clip: lead-in before `first`, tail after `last`, inside the round, at most MAX_CLIP_SECONDS long (the end wins). */
export function clipWindow(first: number, last: number, round: Pick<HighlightRound, "startTick" | "endTick">, tickRate = 64) {
  let to = Math.min(round.endTick, Math.round(last + HIGHLIGHT_TAIL_S * tickRate));
  let from = Math.max(round.startTick, Math.round(first - HIGHLIGHT_LEAD_S * tickRate));
  if (to <= from) to = from + tickRate;
  const max = MAX_CLIP_SECONDS * tickRate;
  if (to - from > max) from = to - max;
  return { from, to };
}

export function detectHighlights({ rounds, finalTeamBySteamId, sideAt, tickRate = 64 }: HighlightInput): Highlight[] {
  const out: Highlight[] = [];
  for (const round of rounds) {
    const sideOf = new Map<string, Side>();
    for (const [id, final] of finalTeamBySteamId) sideOf.set(id, sideAt(final, round.number));

    const byPlayer = new Map<string, HighlightKill[]>();
    for (const k of round.kills) {
      // Exit frags after the round end (savers hunted) are not part of a multi-kill.
      if (k.tick > round.endTick) continue;
      const a = sideOf.get(k.attackerSteamId);
      const v = sideOf.get(k.victimSteamId);
      // Suicides, world deaths and team kills are not frags.
      if (!a || !v || a === v || k.attackerSteamId === k.victimSteamId) continue;
      const list = byPlayer.get(k.attackerSteamId) ?? [];
      list.push(k);
      byPlayer.set(k.attackerSteamId, list);
    }

    const clutch = clutchOf(round, sideOf);
    const wonClutch = clutch && clutch.side === round.winner ? clutch : null;
    const ids = new Set(byPlayer.keys());
    if (wonClutch) ids.add(wonClutch.steamId);

    for (const steamId of ids) {
      const kills = (byPlayer.get(steamId) ?? []).sort((a, b) => a.tick - b.tick);
      const isClutch = wonClutch?.steamId === steamId;
      const multi = multiKind(kills.length);
      if (!isClutch && !multi) continue;

      let first: number;
      let last: number;
      if (isClutch) {
        const after = kills.filter((k) => k.tick >= wonClutch.startTick);
        first = wonClutch.startTick;
        // A multi-kill that started before the clutch still opens the clip, if it fits.
        if (multi && kills.length > 0) first = Math.min(first, kills[0].tick);
        last = after.length > 0 ? after[after.length - 1].tick : wonClutch.startTick + QUIET_CLUTCH_S * tickRate;
      } else {
        first = kills[0].tick;
        last = kills[kills.length - 1].tick;
      }
      const { from, to } = clipWindow(first, last, round, tickRate);
      const marks = kills.map((k) => k.tick).filter((t) => t >= from && t <= to);
      out.push({
        key: `${round.number}-${steamId}`,
        kind: isClutch ? "clutch" : multi!,
        steamId,
        side: sideOf.get(steamId) ?? "CT",
        round: round.number,
        clutch: isClutch ? wonClutch.size : null,
        kills: kills.length,
        headshots: kills.filter((k) => k.headshot).length,
        weapons: kills.map((k) => k.weapon),
        from,
        to,
        focus: marks.length > 0 ? marks[marks.length - 1] : Math.min(to, isClutch ? wonClutch.startTick : first),
        marks,
        score: highlightScore(kills.length, isClutch ? wonClutch.size : null),
      });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.round - b.round);
}
