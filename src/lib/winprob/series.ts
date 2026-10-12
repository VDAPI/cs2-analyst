/**
 * Win probability over a round (the replay's strip) and win probability
 * added per player (WPA) over a match (S14).
 *
 * WPA follows Xenopoulos et al. ("Valuing Player Actions in Counter-
 * Strike"): every kill moves the round's win probability; the killer is
 * credited with that change for their side and the victim debited with it.
 * Summed over a match and divided by rounds it says how much a player moved
 * their team's chances per round, independent of how many kills they got.
 *
 * Pure module, covered by `npm run test:winprob`.
 */
import { buildRoundContext, stateAt, usableRound, type RoundContext, type Side, type WpMatch } from "./features";
import { predictT, type WinProbModelSpec } from "./model";

export interface WpPoint {
  tick: number;
  /** P(CT wins), 0–1. */
  ct: number;
}

export interface WpEvent {
  tick: number;
  kind: "kill" | "plant" | "defuse";
  /** Who did it (killer, planter, defuser). */
  steamId: string;
  victimSteamId?: string;
  side: Side;
  /** CT win probability just before and right after. */
  before: number;
  after: number;
}

export interface RoundSeries {
  roundNumber: number;
  freezeEnd: number;
  decided: number;
  winner: Side;
  points: WpPoint[];
  events: WpEvent[];
}

/** P(CT) every `stepS` seconds of live round time plus across every kill, the plant and the defuse start. */
export function roundSeries(ctx: RoundContext, model: WinProbModelSpec, stepS = 0.5): RoundSeries | null {
  if (!usableRound(ctx)) return null;
  const ct = (tick: number) => 1 - predictT(model, stateAt(ctx, tick));
  const step = Math.max(1, Math.round(stepS * ctx.tickRate));
  const points: WpPoint[] = [];
  for (let t = ctx.freezeEnd; t < ctx.decided; t += step) points.push({ tick: t, ct: round3(ct(t)) });

  const events: WpEvent[] = [];
  for (const k of [...ctx.round.kills].sort((a, b) => a.tick - b.tick)) {
    if (k.tick <= ctx.freezeEnd || k.tick > ctx.decided) continue;
    const side = ctx.sideOf.get(k.attackerSteamId) ?? (ctx.sideOf.get(k.victimSteamId) === "CT" ? "T" : "CT");
    events.push({
      tick: k.tick,
      kind: "kill",
      steamId: k.attackerSteamId,
      victimSteamId: k.victimSteamId,
      side,
      before: round3(ct(k.tick - 1)),
      after: round3(ct(k.tick)),
    });
  }
  if (ctx.plant && ctx.plant.tick <= ctx.decided) {
    events.push({
      tick: ctx.plant.tick,
      kind: "plant",
      steamId: ctx.plant.playerSteamId,
      side: "T",
      before: round3(ct(ctx.plant.tick - 1)),
      after: round3(ct(ctx.plant.tick)),
    });
  }
  const defuse = ctx.round.bombs.find((b) => b.type === "DEFUSE_BEGIN" && b.tick <= ctx.decided);
  if (defuse) {
    events.push({
      tick: defuse.tick,
      kind: "defuse",
      steamId: defuse.playerSteamId,
      side: "CT",
      before: round3(ct(defuse.tick - 1)),
      after: round3(ct(defuse.tick)),
    });
  }
  events.sort((a, b) => a.tick - b.tick);
  // Close the line at the result.
  points.push({ tick: ctx.decided, ct: ctx.round.winner === "CT" ? 1 : 0 });
  return { roundNumber: ctx.round.number, freezeEnd: ctx.freezeEnd, decided: ctx.decided, winner: ctx.round.winner, points, events };
}

export interface PlayerWpa {
  steamId: string;
  /** Rounds the player appears in with replay data. */
  rounds: number;
  /** Sum of win probability added, 0–1 units (×100 = pp). */
  total: number;
  /** Credit from kills, debit from deaths. */
  fromKills: number;
  fromDeaths: number;
}

/** WPA of every player over the match's rounds with replay data. */
export function matchWpa(match: WpMatch, model: WinProbModelSpec): PlayerWpa[] {
  const out = new Map<string, PlayerWpa>();
  const get = (id: string) => {
    let p = out.get(id);
    if (!p) {
      p = { steamId: id, rounds: 0, total: 0, fromKills: 0, fromDeaths: 0 };
      out.set(id, p);
    }
    return p;
  };
  for (const round of match.rounds) {
    const ctx = buildRoundContext(round, match.tickRate, match.sites);
    if (!usableRound(ctx)) continue;
    for (const id of ctx.sideOf.keys()) get(id).rounds++;
    for (const k of round.kills) {
      if (k.tick <= ctx.freezeEnd || k.tick > ctx.decided) continue;
      const victimSide = ctx.sideOf.get(k.victimSteamId);
      if (!victimSide) continue;
      const pT = (tick: number) => predictT(model, stateAt(ctx, tick));
      const deltaT = pT(k.tick) - pT(k.tick - 1);
      // The victim's side lost this much; the killer's side (the other one) gained it.
      const victimLoss = victimSide === "T" ? deltaT : -deltaT;
      get(k.victimSteamId).fromDeaths += victimLoss;
      get(k.victimSteamId).total += victimLoss;
      if (k.attackerSteamId && ctx.sideOf.get(k.attackerSteamId) && ctx.sideOf.get(k.attackerSteamId) !== victimSide) {
        get(k.attackerSteamId).fromKills -= victimLoss;
        get(k.attackerSteamId).total -= victimLoss;
      }
    }
  }
  return [...out.values()];
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
