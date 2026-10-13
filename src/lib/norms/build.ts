/**
 * Norm samples of one match (S13): the S8–S12 analyses run on the match's
 * stored inputs once for all rounds and once per side, and every player's
 * report metrics become a `NormSampleInput`. Pure; the DB side is sample.ts.
 *
 * Sides are per half (CLAUDE.md): rounds are split by the side one team
 * played them on, read from the replay frames, with the regulation halves as
 * fallback for rounds without frames (none in overtime matches). Running an
 * analysis on the rounds where team A was CT gives every A player's CT
 * numbers and every B player's T numbers at once.
 */
import { analyzeMovement, type MovementInput, type PlayerMechanics } from "@/lib/analysis/movement";
import { analyzeAim, type AimInput, type PlayerAim } from "@/lib/analysis/aim";
import { analyzeTactics, type PlayerTactics, type TacticsInput } from "@/lib/analysis/tactics";
import { analyzeUtility, type PlayerUtility, type UtilityInput } from "@/lib/analysis/utility";
import { playerMetrics } from "@/lib/findings/report";
import { placeLookup, type PlaceCell } from "@/lib/analysis/places";
import { siteCentresFromCells } from "@/lib/analysis/sites";
import { detectRoles, type Role, type SideProfile } from "@/lib/roles/roles";
import { metricsToSample, type NormSide, type NormSampleInput, type SampleMetrics } from "./norms";

type Side = "CT" | "T";
const other = (s: Side): Side => (s === "CT" ? "T" : "CT");

const REGULATION_ROUNDS = 24;
const HALF = 12;

export interface SideRoundsInput {
  rounds: Array<{ number: number; frames: Array<{ players: Array<{ steamId: string; team: Side }> }> }>;
  /** MatchPlayer.team: the side each player finished the match on. */
  players: Array<{ steamId: string; team: Side }>;
}

export interface SideGroup {
  rounds: Set<number>;
  sideOf: Map<string, Side>;
}

/**
 * The match's rounds in two groups: rounds where the team that finished on
 * CT ("A") played CT, and rounds where it played T. Each group carries every
 * player's side in it. Rounds whose side is unknown are left out.
 */
export function splitRoundsBySide({ rounds, players }: SideRoundsInput): SideGroup[] {
  const teamA = new Set(players.filter((p) => p.team === "CT").map((p) => p.steamId));
  const total = rounds.length;
  const aCt = new Set<number>();
  const aT = new Set<number>();
  for (const r of rounds) {
    let side: Side | null = null;
    for (const f of r.frames) {
      for (const p of f.players) {
        if (teamA.has(p.steamId)) {
          side = p.team;
          break;
        }
        if (players.some((q) => q.steamId === p.steamId)) {
          side = other(p.team);
          break;
        }
      }
      if (side) break;
    }
    // No frames: A finished on CT, so it played T in the first regulation half.
    if (!side && total <= REGULATION_ROUNDS) side = r.number <= HALF && total > HALF ? "T" : "CT";
    if (side === "CT") aCt.add(r.number);
    else if (side === "T") aT.add(r.number);
  }
  const sideMap = (aSide: Side) =>
    new Map(players.map((p) => [p.steamId, teamA.has(p.steamId) ? aSide : other(aSide)] as const));
  return [
    { rounds: aCt, sideOf: sideMap("CT") },
    { rounds: aT, sideOf: sideMap("T") },
  ].filter((g) => g.rounds.size > 0);
}

const hasRoundNumber = (x: unknown): x is { roundNumber: number } =>
  typeof x === "object" && x !== null && typeof (x as { roundNumber?: unknown }).roundNumber === "number";
const hasNumber = (x: unknown): x is { number: number } =>
  typeof x === "object" && x !== null && typeof (x as { number?: unknown }).number === "number";

/** The same analysis input restricted to some rounds: `rounds` by number, every per-round event list by roundNumber. */
export function onlyRounds<T extends object>(input: T, keep: Set<number>): T {
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const [key, value] of Object.entries(input)) {
    if (!Array.isArray(value)) continue;
    if (key === "rounds") out[key] = value.filter((r) => hasNumber(r) && keep.has(r.number));
    else if (value.length > 0 && hasRoundNumber(value[0])) {
      out[key] = value.filter((e) => hasRoundNumber(e) && keep.has(e.roundNumber));
    }
  }
  return out as T;
}

export interface NormMatchInput {
  map: string;
  pro: boolean;
  players: Array<{ steamId: string; team: Side; rank: string | null }>;
  mechanics: MovementInput | null;
  aim: AimInput | null;
  tactics: TacticsInput | null;
  utility: UtilityInput | null;
  /** The map's callout cells (MapPlaceCell), so role detection knows the bombsites. */
  places?: PlaceCell[];
}

export interface BuiltNormSample extends NormSampleInput {
  steamId: string;
  /** Role on that side (S24); the match role on the "all" sample. */
  role: Role | null;
  /** The side's role profile (timing, spacing, setup spots); null on the "all" sample. */
  profile: SideProfile | null;
}

interface Analysed {
  mech: Map<string, PlayerMechanics>;
  aim: Map<string, PlayerAim>;
  tactics: Map<string, PlayerTactics>;
  utility: Map<string, PlayerUtility>;
}

const bySteamId = <T extends { steamId: string }>(rows: T[]) => new Map(rows.map((r) => [r.steamId, r]));

function analyse(input: NormMatchInput, keep: Set<number> | null): Analysed {
  const cut = <T extends object>(x: T | null): T | null => (x && keep ? onlyRounds(x, keep) : x);
  const mech = cut(input.mechanics);
  const aim = cut(input.aim);
  // The side fallback for rounds without frames must still see the whole match's length.
  const tactics = input.tactics && keep
    ? { ...onlyRounds(input.tactics, keep), totalRounds: input.tactics.rounds.reduce((m, r) => Math.max(m, r.number), 0) }
    : input.tactics;
  const utility = cut(input.utility);
  return {
    mech: bySteamId(mech && mech.rounds.length ? analyzeMovement(mech) : []),
    aim: bySteamId(aim && aim.rounds.length ? analyzeAim(aim) : []),
    tactics: bySteamId(tactics && tactics.rounds.length ? analyzeTactics(tactics) : []),
    utility: bySteamId(utility && utility.rounds.length ? analyzeUtility(utility) : []),
  };
}

function sampleOf(a: Analysed, steamId: string): SampleMetrics {
  const mech = a.mech.get(steamId) ?? null;
  const tactics = a.tactics.get(steamId) ?? null;
  const metrics = playerMetrics(mech, a.aim.get(steamId) ?? null, tactics, a.utility.get(steamId) ?? null);
  // Counts are scaled to 24 rounds by the rounds the player played in this sample.
  return metricsToSample(metrics, mech?.weapons ?? [], tactics?.rounds ?? 0);
}

/** Frames of whichever input has them (they all come from the same RoundTicks). */
function framesInput(input: NormMatchInput): SideRoundsInput["rounds"] {
  const src = input.mechanics?.rounds ?? input.aim?.rounds ?? input.utility?.rounds ?? input.tactics?.rounds ?? [];
  return src.map((r) => ({ number: r.number, frames: r.frames }));
}

/** Every player's samples: whole match ("all") plus CT and T. Players without any metric are skipped. */
export function buildNormSamples(input: NormMatchInput): BuiltNormSample[] {
  const out: BuiltNormSample[] = [];
  const places = input.places?.length ? placeLookup(input.places) : undefined;
  const sites = input.places?.length ? siteCentresFromCells(input.places) : undefined;
  const roles = new Map(
    (input.tactics ? detectRoles(input.tactics, { placeOf: places, sites }) : []).map((r) => [r.steamId, r] as const)
  );
  const push = (steamId: string, side: NormSide, metrics: SampleMetrics) => {
    const r = roles.get(steamId);
    const sideRoles = side === "all" ? null : (r?.sides[side] ?? null);
    const role = side === "all" ? (r?.role ?? null) : (sideRoles?.role ?? null);
    if (Object.keys(metrics).length === 0 && !role) return;
    const rank = input.players.find((p) => p.steamId === steamId)?.rank ?? null;
    out.push({ steamId, side, map: input.map, pro: input.pro, rank, metrics, role, profile: sideRoles?.profile ?? null });
  };

  const whole = analyse(input, null);
  for (const p of input.players) push(p.steamId, "all", sampleOf(whole, p.steamId));

  const groups = splitRoundsBySide({ rounds: framesInput(input), players: input.players });
  for (const g of groups) {
    const part = analyse(input, g.rounds);
    for (const p of input.players) {
      const side = g.sideOf.get(p.steamId);
      if (side) push(p.steamId, side, sampleOf(part, p.steamId));
    }
  }
  return out;
}
