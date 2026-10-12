/**
 * Tactics (S12): teamplay, economy and positions, from the data already in the
 * DB — kills, damage, bomb events, per-round economy snapshots (RoundPlayer)
 * and the sampled replay frames (RoundTicks). No .dem needed.
 *
 * What it finds, per player:
 * - untraded_death: died where no teammate could trade (nearest one too far),
 * - missed_trade: a teammate died close by and the player did not refrag,
 * - entry_death: first death of the round as T, alone and untraded,
 * - lurk_death: died far from the team as T before the plant, without impact,
 * - early_rotation: CT left the site that then got planted, on little info,
 * - postplant_death: T took a fight after the plant with the numbers on his side,
 * - retake_solo: CT went into the retake alone,
 * - clutch_decision: last alive and chose wrong (no save, no plant, no time play),
 * - bad_force: the team forced, lost, and could not full-buy next round,
 * - no_drop: rich player, broke teammate, no drop,
 * - death_with_money: died with a lot of money left unspent,
 * - predictable_position: CT held the same spot round after round.
 *
 * Sides are per round (per half, see CLAUDE.md): read from the frames' team,
 * falling back to the regulation halves when a round has no frames. Every
 * judgement uses what the player could know: a teammate's death within
 * earshot, the team's own spotting (`spottedBy`) for rotations, the money on
 * the scoreboard for economy.
 *
 * Pure module (no DB), covered by `npm run test:tactics`.
 */

/** Bump when detection or summary numbers change; stored rows are recomputed. */
export const TACTICS_VERSION = 1;

/** A kill of the killer within this many seconds trades the death. */
export const TRADE_WINDOW_S = 3;
/** Nearest alive teammate farther than this could not trade (≈ 3 s of running). */
export const TRADE_RANGE = 700;
/** A teammate dying this close is heard and is the player's trade to take. */
export const MISSED_TRADE_RANGE = 900;
/** …if the killer is within reach. */
export const KILLER_REACH = 1800;
/** Entry with a teammate this close has someone to trade it. */
export const ENTRY_SUPPORT = 500;
/** T this far from every teammate is lurking. */
export const LURK_RANGE = 1800;
/** CTs this far apart in a retake are not going in together. */
export const RETAKE_GROUP_RANGE = 1000;
export const BOMB_TIMER_S = 40;
/** CT setup spot = position this long after freeze end. */
export const ANCHOR_DELAY_S = 20;
/** Two setup spots this close are the same spot. */
export const SAME_SPOT = 350;
/** Setup spot this close to the plant = the player was holding that site. */
export const SITE_RANGE = 1000;
/** At the plant the player was this far from it = rotated away. */
export const ROTATED_AWAY = 1500;
/** Moving this far from the setup spot = left the spot. */
export const LEFT_SPOT = 600;
/** Enemies the team saw in this window before leaving count as info. */
export const INFO_WINDOW_S = 10;
/** Seeing at least this many enemies justifies a rotation. */
export const ROTATE_INFO_ENEMIES = 3;
/** Avg equipment per player that counts as a full buy. */
export const FULL_BUY_EQUIP = 4000;
/** Unspent money worth a drop (a rifle). */
export const DROP_MONEY = { T: 2700, CT: 3100 } as const;
/** Unspent money that should have become utility / armour. */
export const UNSPENT_MONEY = 3000;
/** In the last round of a half all money goes; more than this left is wasted. */
export const LAST_ROUND_UNSPENT = 1500;

type Side = "CT" | "T";

// ─── Inputs ──────────────────────────────────────────────

export interface TacticsFramePlayer {
  steamId: string;
  team: Side;
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  isAlive: boolean;
  /** Who can see this player; undefined when the round has no spotting data. */
  spottedBy?: string[];
}

export interface TacticsFrame {
  tick: number;
  players: TacticsFramePlayer[];
}

export interface TacticsRound {
  number: number;
  startTick: number;
  endTick: number;
  winner: Side;
  winReason: string;
  /** Team scores after the round (teamA = side the team finished on is CT). */
  ctScore: number;
  tScore: number;
  frames: TacticsFrame[];
}

export interface TacticsKill {
  tick: number;
  roundNumber: number;
  attackerSteamId: string;
  victimSteamId: string;
  attackerPosX: number;
  attackerPosY: number;
  attackerPosZ: number;
  victimPosX: number;
  victimPosY: number;
  victimPosZ: number;
  /** Normalised weapon name (Kill.weapon); role detection counts AWP kills with it. */
  weapon?: string;
}

export interface TacticsDamage {
  tick: number;
  roundNumber: number;
  attackerSteamId: string | null;
  victimSteamId: string;
}

export interface TacticsBomb {
  tick: number;
  roundNumber: number;
  type: string;
  playerSteamId: string;
  posX: number;
  posY: number;
  posZ: number;
  site: string | null;
}

/** Money and equipment at freeze end (RoundPlayer). */
export interface TacticsEcon {
  roundNumber: number;
  steamId: string;
  equipValue: number;
  money: number;
}

export interface TacticsPlayer {
  steamId: string;
  name: string;
  /** Side the player finished the match on (MatchPlayer.team). */
  team: Side;
}

export interface TacticsInput {
  tickRate: number;
  rounds: TacticsRound[];
  kills: TacticsKill[];
  damages: TacticsDamage[];
  bombs: TacticsBomb[];
  economy: TacticsEcon[];
  players: TacticsPlayer[];
  /**
   * Rounds in the whole match, when `rounds` is only part of it (the norms'
   * per-side runs); the regulation-half fallback for rounds without frames
   * needs it. Defaults to the last round's number.
   */
  totalRounds?: number;
}

// ─── Outputs ─────────────────────────────────────────────

export type TacticsMomentType =
  | "untraded_death"
  | "missed_trade"
  | "entry_death"
  | "lurk_death"
  | "early_rotation"
  | "postplant_death"
  | "retake_solo"
  | "clutch_decision"
  | "bad_force"
  | "no_drop"
  | "death_with_money"
  | "predictable_position";

export interface TacticsValue {
  label: string;
  value: number;
  unit: string;
  ref?: number;
}

export interface TacticsMoment {
  type: TacticsMomentType;
  /** Sub-case that changes the advice (clutch: "save" | "no_plant" | "time"; …). */
  variant?: string;
  roundNumber: number;
  tick: number;
  /** Seconds since round start (freeze time included). */
  roundTime: number;
  /** The main number of the moment, see `values[0]`. */
  value: number;
  values: TacticsValue[];
  /** Short facts in Polish. */
  detail: string;
  /** Did it cost something directly (a death, a free kill for the enemy, money)? */
  costly: boolean;
  /** The player's side lost the round. */
  lost: boolean;
  /** The enemy the moment is about (killer), if any. */
  enemy?: string;
}

export interface PlayerTactics {
  steamId: string;
  rounds: number;
  deaths: number;
  tradedDeaths: number;
  /** Deaths with a known distance to the nearest teammate (frames present). */
  isolatedDeaths: number;
  /** Times the player was the nearest teammate to an untraded-or-traded death. */
  tradeChances: number;
  tradesMade: number;
  openingDuels: number;
  openingWins: number;
  /** CT rounds with a setup spot, in halves with enough of them. */
  anchorRounds: number;
  /** …of which at the player's most used spot. */
  sameSpotRounds: number;
  forceRounds: number;
  badForces: number;
  moments: TacticsMoment[];
}

// ─── Helpers ─────────────────────────────────────────────

interface Vec {
  x: number;
  y: number;
  z: number;
}

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const r1 = (v: number) => Math.round(v * 10) / 10;
const other = (s: Side): Side => (s === "CT" ? "T" : "CT");

/** Regulation half (0, 1) or overtime half (2, 3, …) of a round, MR12 / MR3. */
export function halfOf(round: number): number {
  if (round <= 12) return 0;
  if (round <= 24) return 1;
  return 2 + Math.floor((round - 25) / 3);
}

/** Last round of its half: money resets after it. */
export function isLastOfHalf(round: number): boolean {
  return round === 12 || round === 24 || (round > 24 && (round - 24) % 3 === 0);
}

/** CS2 loss bonus after `streak` consecutive losses (1 → $1400 … 5+ → $3400). */
export function lossBonus(streak: number): number {
  return Math.min(1400 + 500 * Math.max(0, streak - 1), 3400);
}

function frameAt(frames: TacticsFrame[], tick: number): TacticsFrame | null {
  if (frames.length === 0) return null;
  let lo = 0;
  let hi = frames.length - 1;
  if (tick <= frames[0].tick) return frames[0];
  if (tick >= frames[hi].tick) return frames[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].tick <= tick) lo = mid;
    else hi = mid;
  }
  return tick - frames[lo].tick <= frames[hi].tick - tick ? frames[lo] : frames[hi];
}

/** First frame where anyone moves: freeze time is over. */
export function freezeEndTick(round: Pick<TacticsRound, "startTick" | "frames">, tickRate: number): number {
  for (const f of round.frames) {
    if (f.players.some((p) => p.isAlive && Math.hypot(p.velX, p.velY) > 1)) return f.tick;
  }
  return round.startTick + 15 * tickRate;
}

/**
 * Every player's side in one round: frames first, then the regulation halves
 * (unknown in overtime matches). `finalSide` = the side each player finished on.
 */
export function roundSides(
  r: Pick<TacticsRound, "number" | "frames">,
  finalSide: Map<string, Side>,
  totalRounds: number
): Map<string, Side> {
  const sides = new Map<string, Side>();
  for (const f of r.frames) {
    for (const p of f.players) if (!sides.has(p.steamId)) sides.set(p.steamId, p.team);
    if (sides.size >= finalSide.size) break;
  }
  if (totalRounds <= 24) {
    for (const [id, team] of finalSide) {
      if (!sides.has(id)) sides.set(id, r.number <= 12 && totalRounds > 12 ? other(team) : team);
    }
  }
  return sides;
}

/** Nearest frame to a tick (binary search over frames sorted by tick). */
export { frameAt };

// ─── Analysis ────────────────────────────────────────────

interface RoundCtx {
  round: TacticsRound;
  kills: TacticsKill[];
  plant: TacticsBomb | null;
  freezeEnd: number;
  sideOf: Map<string, Side>;
  roster: Record<Side, string[]>;
  /** steamId → tick of death in this round. */
  deathTick: Map<string, number>;
}

function emptyPlayer(steamId: string): PlayerTactics {
  return {
    steamId,
    rounds: 0,
    deaths: 0,
    tradedDeaths: 0,
    isolatedDeaths: 0,
    tradeChances: 0,
    tradesMade: 0,
    openingDuels: 0,
    openingWins: 0,
    anchorRounds: 0,
    sameSpotRounds: 0,
    forceRounds: 0,
    badForces: 0,
    moments: [],
  };
}

export function analyzeTactics(input: TacticsInput): PlayerTactics[] {
  const { tickRate } = input;
  const out = new Map<string, PlayerTactics>(input.players.map((p) => [p.steamId, emptyPlayer(p.steamId)]));
  const nameOf = new Map(input.players.map((p) => [p.steamId, p.name]));
  const finalSide = new Map(input.players.map((p) => [p.steamId, p.team]));
  const rounds = [...input.rounds].sort((a, b) => a.number - b.number);
  const totalRounds = input.totalRounds ?? rounds.at(-1)?.number ?? 0;
  const push = (steamId: string, m: TacticsMoment) => out.get(steamId)?.moments.push(m);
  const roundTime = (r: TacticsRound, tick: number) => r1((tick - r.startTick) / tickRate);
  const seconds = (ticks: number) => r1(ticks / tickRate);

  const killsBy = new Map<number, TacticsKill[]>();
  for (const k of input.kills) {
    const list = killsBy.get(k.roundNumber) ?? [];
    list.push(k);
    killsBy.set(k.roundNumber, list);
  }
  const damagesBy = new Map<number, TacticsDamage[]>();
  for (const d of input.damages) {
    const list = damagesBy.get(d.roundNumber) ?? [];
    list.push(d);
    damagesBy.set(d.roundNumber, list);
  }
  const econBy = new Map<number, Map<string, TacticsEcon>>();
  for (const e of input.economy) {
    const m = econBy.get(e.roundNumber) ?? new Map<string, TacticsEcon>();
    m.set(e.steamId, e);
    econBy.set(e.roundNumber, m);
  }

  const sidesFor = (r: TacticsRound) => roundSides(r, finalSide, totalRounds);

  const ctxs: RoundCtx[] = rounds.map((round) => {
    const sideOf = sidesFor(round);
    const roster: Record<Side, string[]> = { CT: [], T: [] };
    for (const [id, side] of sideOf) if (out.has(id)) roster[side].push(id);
    const kills = (killsBy.get(round.number) ?? [])
      .filter((k) => {
        const a = sideOf.get(k.attackerSteamId);
        const v = sideOf.get(k.victimSteamId);
        return a != null && v != null && a !== v && out.has(k.attackerSteamId) && out.has(k.victimSteamId);
      })
      .sort((a, b) => a.tick - b.tick);
    const deathTick = new Map<string, number>();
    for (const k of (killsBy.get(round.number) ?? []).sort((a, b) => a.tick - b.tick)) {
      if (!deathTick.has(k.victimSteamId)) deathTick.set(k.victimSteamId, k.tick);
    }
    const plant =
      input.bombs
        .filter((b) => b.roundNumber === round.number && b.type === "PLANTED")
        .sort((a, b) => a.tick - b.tick)[0] ?? null;
    return { round, kills, plant, freezeEnd: freezeEndTick(round, tickRate), sideOf, roster, deathTick };
  });

  const alive = (c: RoundCtx, id: string, tick: number) => {
    const d = c.deathTick.get(id);
    return d == null || d > tick;
  };
  const aliveOn = (c: RoundCtx, side: Side, tick: number, except?: string) =>
    c.roster[side].filter((id) => id !== except && alive(c, id, tick));
  const posAt = (c: RoundCtx, id: string, tick: number): Vec | null => {
    const p = frameAt(c.round.frames, tick)?.players.find((q) => q.steamId === id);
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  };
  /** Was `killer` killed by `side` within the trade window after `tick`? */
  const tradedBy = (c: RoundCtx, killer: string, side: Side, tick: number) =>
    c.kills.find(
      (k) =>
        k.victimSteamId === killer &&
        c.sideOf.get(k.attackerSteamId) === side &&
        k.tick > tick &&
        k.tick <= tick + TRADE_WINDOW_S * tickRate
    ) ?? null;

  for (const c of ctxs) {
    const { round } = c;
    for (const id of [...c.roster.CT, ...c.roster.T]) out.get(id)!.rounds++;

    const opening = c.kills[0];
    if (opening) {
      out.get(opening.attackerSteamId)!.openingDuels++;
      out.get(opening.attackerSteamId)!.openingWins++;
      out.get(opening.victimSteamId)!.openingDuels++;
    }

    const killsOf = (id: string, before: number) => c.kills.filter((k) => k.attackerSteamId === id && k.tick < before).length;
    const lostBy = (side: Side) => round.winner !== side;

    for (const k of c.kills) {
      const victim = k.victimSteamId;
      const killer = k.attackerSteamId;
      const side = c.sideOf.get(victim)!;
      const stats = out.get(victim)!;
      stats.deaths++;
      const trade = tradedBy(c, killer, side, k.tick);
      if (trade) stats.tradedDeaths++;
      const mates = aliveOn(c, side, k.tick, victim);
      const victimPos = posAt(c, victim, k.tick) ?? { x: k.victimPosX, y: k.victimPosY, z: k.victimPosZ };
      const killerPos = { x: k.attackerPosX, y: k.attackerPosY, z: k.attackerPosZ };
      const mateDist = mates
        .map((id) => ({ id, pos: posAt(c, id, k.tick) }))
        .filter((m): m is { id: string; pos: Vec } => m.pos != null)
        .map((m) => ({ id: m.id, d: dist(m.pos, victimPos) }))
        .sort((a, b) => a.d - b.d);
      const nearest = mateDist[0] ?? null;

      // ── Missed trade: the nearest teammate in earshot did not refrag ──
      if (nearest && nearest.d <= MISSED_TRADE_RANGE) {
        const mate = nearest.id;
        const matePos = posAt(c, mate, k.tick)!;
        const tradedByMate = trade?.attackerSteamId === mate;
        if (!trade || tradedByMate) {
          const reach = dist(matePos, killerPos);
          if (reach <= KILLER_REACH) {
            out.get(mate)!.tradeChances++;
            if (tradedByMate) {
              out.get(mate)!.tradesMade++;
            } else {
              const until = k.tick + TRADE_WINDOW_S * tickRate;
              const engaged = (damagesBy.get(round.number) ?? []).some(
                (d) => d.attackerSteamId === mate && d.victimSteamId === killer && d.tick > k.tick && d.tick <= until
              );
              const mateDied = (c.deathTick.get(mate) ?? Infinity) <= until;
              if (!engaged && !mateDied) {
                const moreKills = c.kills.filter(
                  (q) => q.attackerSteamId === killer && q.tick > k.tick && c.sideOf.get(q.victimSteamId) === side
                ).length;
                push(mate, {
                  type: "missed_trade",
                  roundNumber: round.number,
                  tick: k.tick,
                  roundTime: roundTime(round, k.tick),
                  value: Math.round(nearest.d),
                  values: [
                    { label: "Do kolegi", value: Math.round(nearest.d), unit: "u", ref: MISSED_TRADE_RANGE },
                    { label: "Do zabójcy", value: Math.round(reach), unit: "u" },
                  ],
                  detail:
                    `${nameOf.get(victim) ?? "kolega"} zginął ${Math.round(nearest.d)} u od ciebie, ` +
                    `zabójca nie dostał odpowiedzi w ${TRADE_WINDOW_S} s` +
                    (moreKills > 0 ? `, potem zabił jeszcze ${moreKills}` : ""),
                  costly: moreKills > 0,
                  lost: lostBy(side),
                  enemy: killer,
                });
              }
            }
          }
        }
      }

      if (trade) continue;
      if (mates.length === 0) continue; // last alive: clutch, judged below
      if (nearest) stats.isolatedDeaths += nearest.d >= TRADE_RANGE ? 1 : 0;

      const base = {
        roundNumber: round.number,
        tick: k.tick,
        roundTime: roundTime(round, k.tick),
        costly: true,
        lost: lostBy(side),
        enemy: killer,
      };
      const nearValues: TacticsValue[] = nearest
        ? [{ label: "Najbliższy kolega", value: Math.round(nearest.d), unit: "u", ref: TRADE_RANGE }]
        : [];
      const plant = c.plant && c.plant.tick < k.tick ? c.plant : null;

      if (plant && side === "CT") {
        if (nearest && nearest.d >= RETAKE_GROUP_RANGE) {
          push(victim, {
            ...base,
            type: "retake_solo",
            value: Math.round(nearest.d),
            values: nearValues,
            detail: `retake po plancie: zginąłeś sam, najbliższy CT ${Math.round(nearest.d)} u dalej`,
          });
        }
        continue;
      }
      if (plant && side === "T") {
        const tAlive = aliveOn(c, "T", k.tick - 1).length;
        const ctAlive = aliveOn(c, "CT", k.tick - 1).length;
        const left = BOMB_TIMER_S - (k.tick - plant.tick) / tickRate;
        if (tAlive >= ctAlive && left >= 15) {
          push(victim, {
            ...base,
            type: "postplant_death",
            value: Math.round(left),
            values: [
              { label: "Do wybuchu", value: Math.round(left), unit: "s" },
              { label: "Przewaga", value: tAlive - ctAlive, unit: "" },
            ],
            detail: `po plancie ${tAlive}v${ctAlive}, ${Math.round(left)} s do wybuchu: wdałeś się w walkę i zginąłeś bez trade'u`,
          });
        }
        continue;
      }
      if (k === opening && side === "T" && (!nearest || nearest.d >= ENTRY_SUPPORT)) {
        push(victim, {
          ...base,
          type: "entry_death",
          value: nearest ? Math.round(nearest.d) : 0,
          values: nearValues,
          detail: nearest
            ? `pierwsza śmierć rundy, najbliższy kolega ${Math.round(nearest.d)} u za tobą, nikt nie odegrał`
            : "pierwsza śmierć rundy bez trade'u",
        });
        continue;
      }
      if (side === "T" && nearest && nearest.d >= LURK_RANGE && killsOf(victim, k.tick) === 0) {
        push(victim, {
          ...base,
          type: "lurk_death",
          value: Math.round(nearest.d),
          values: nearValues,
          detail: `lurk: zginąłeś ${Math.round(nearest.d)} u od drużyny przed plantem, bez zabójstwa w tej rundzie`,
        });
        continue;
      }
      if (nearest && nearest.d >= TRADE_RANGE) {
        push(victim, {
          ...base,
          type: "untraded_death",
          value: Math.round(nearest.d),
          values: [
            ...nearValues,
            { label: "Dobieg kolegi", value: r1(nearest.d / 250), unit: "s", ref: TRADE_WINDOW_S },
          ],
          detail:
            (k === opening ? "pierwsza śmierć rundy, " : "") +
            `najbliższy kolega ${Math.round(nearest.d)} u dalej (ok. ${r1(nearest.d / 250)} s biegu), nikt nie mógł odegrać`,
        });
      }
    }

    // ── Clutch decisions ──
    for (const side of ["CT", "T"] as Side[]) {
      const roster = c.roster[side];
      if (roster.length < 2) continue;
      const deathsOnSide = c.kills.filter((k) => c.sideOf.get(k.victimSteamId) === side);
      // The moment one player is left alone.
      const lastMateDeath = deathsOnSide.find((k) => aliveOn(c, side, k.tick).length === 1);
      if (!lastMateDeath) continue;
      const solo = aliveOn(c, side, lastMateDeath.tick)[0];
      if (!solo) continue;
      const soloStart = lastMateDeath.tick;
      const enemiesAt = (tick: number) => aliveOn(c, other(side), tick).length;
      if (enemiesAt(soloStart) === 0) continue;
      const soloDeath = c.deathTick.get(solo);
      const plant = c.plant;

      if (side === "CT" && plant && soloDeath != null && soloDeath > plant.tick) {
        const left = BOMB_TIMER_S - (soloDeath - plant.tick) / tickRate;
        const enemies = enemiesAt(soloDeath - 1);
        const killer = c.kills.find((k) => k.victimSteamId === solo);
        if (left < 10 && enemies >= 1 && killer) {
          push(solo, {
            type: "clutch_decision",
            variant: "save",
            roundNumber: round.number,
            tick: soloDeath,
            roundTime: roundTime(round, soloDeath),
            value: r1(left),
            values: [
              { label: "Do wybuchu", value: r1(left), unit: "s", ref: 10 },
              { label: "Wrogów", value: enemies, unit: "" },
            ],
            detail: `1v${enemies} po plancie, ${r1(left)} s do wybuchu: rozbrojenie było już niemożliwe${left >= 5 ? " bez zestawu" : ""}, a zginąłeś z bronią`,
            costly: true,
            lost: lostBy(side),
            enemy: killer.attackerSteamId,
          });
        }
      }
      if (side === "T" && !plant && round.winReason === "TIME_RAN_OUT" && round.winner === "CT" && soloDeath == null) {
        const soloSeconds = (round.endTick - soloStart) / tickRate;
        if (soloSeconds >= 15) {
          push(solo, {
            type: "clutch_decision",
            variant: "no_plant",
            roundNumber: round.number,
            tick: soloStart,
            roundTime: roundTime(round, soloStart),
            value: Math.round(soloSeconds),
            values: [
              { label: "Czas w clutchu", value: Math.round(soloSeconds), unit: "s" },
              { label: "Wrogów", value: enemiesAt(soloStart), unit: "" },
            ],
            detail: `zostałeś sam na ${Math.round(soloSeconds)} s przed końcem i runda skończyła się na czas bez plantu`,
            costly: true,
            lost: true,
          });
        }
      }
      if (side === "T" && plant && soloDeath != null && soloDeath > plant.tick && round.winReason === "BOMB_DEFUSED") {
        const left = BOMB_TIMER_S - (soloDeath - plant.tick) / tickRate;
        const killer = c.kills.find((k) => k.victimSteamId === solo);
        if (left >= 15 && killer) {
          const enemies = enemiesAt(soloDeath - 1);
          push(solo, {
            type: "clutch_decision",
            variant: "time",
            roundNumber: round.number,
            tick: soloDeath,
            roundTime: roundTime(round, soloDeath),
            value: Math.round(left),
            values: [
              { label: "Do wybuchu", value: Math.round(left), unit: "s" },
              { label: "Wrogów", value: enemies, unit: "" },
            ],
            detail: `1v${enemies} po plancie, ${Math.round(left)} s do wybuchu: zginąłeś w walce, a bomba została rozbrojona`,
            costly: true,
            lost: true,
            enemy: killer.attackerSteamId,
          });
        }
      }
    }

    // ── Early rotation (CT left the site that got planted, on little info) ──
    if (c.plant && round.frames.length > 0) {
      const plant = c.plant;
      const plantPos = { x: plant.posX, y: plant.posY, z: plant.posZ };
      const anchorTick = c.freezeEnd + ANCHOR_DELAY_S * tickRate;
      if (anchorTick < plant.tick) {
        for (const id of c.roster.CT) {
          if (!alive(c, id, plant.tick)) continue;
          const anchor = posAt(c, id, anchorTick);
          const atPlant = posAt(c, id, plant.tick);
          if (!anchor || !atPlant) continue;
          if (dist(anchor, plantPos) > SITE_RANGE || dist(atPlant, plantPos) < ROTATED_AWAY) continue;
          const span = round.frames.filter((f) => f.tick >= anchorTick && f.tick <= plant.tick);
          let leftAt: number | null = null;
          for (const f of span) {
            const p = f.players.find((q) => q.steamId === id);
            if (!p) continue;
            if (dist(p, anchor) <= LEFT_SPOT) leftAt = null;
            else if (leftAt == null) leftAt = f.tick;
          }
          if (leftAt == null) continue;
          // What the team knew when the player left: enemies its own players had seen.
          const window = round.frames.filter(
            (f) => f.tick >= leftAt! - INFO_WINDOW_S * tickRate && f.tick <= leftAt!
          );
          if (window.length === 0 || window.some((f) => f.players.some((p) => p.spottedBy === undefined))) continue;
          const seen = new Set<string>();
          for (const f of window) {
            for (const p of f.players) {
              if (c.sideOf.get(p.steamId) !== "T" || !p.isAlive) continue;
              if (p.spottedBy!.some((s) => c.sideOf.get(s) === "CT")) seen.add(p.steamId);
            }
          }
          if (seen.size >= ROTATE_INFO_ENEMIES) continue;
          const before = seconds(plant.tick - leftAt);
          push(id, {
            type: "early_rotation",
            roundNumber: round.number,
            tick: leftAt,
            roundTime: roundTime(round, leftAt),
            value: before,
            values: [
              { label: "Przed plantem", value: before, unit: "s" },
              { label: "Widziani wrogowie", value: seen.size, unit: "", ref: ROTATE_INFO_ENEMIES },
            ],
            detail:
              `zszedłeś z pozycji ${before} s przed plantem${plant.site ? ` na ${plant.site}` : ""}, ` +
              `a team widział wtedy ${seen.size} ${seen.size === 1 ? "wroga" : "wrogów"}`,
            costly: true,
            lost: lostBy("CT"),
          });
        }
      }
    }
  }

  // ── Economy ──
  const ctxByNumber = new Map(ctxs.map((c) => [c.round.number, c]));
  for (const c of ctxs) {
    const n = c.round.number;
    const econ = econBy.get(n);
    if (!econ || econ.size === 0) continue;
    const pistol = n === 1 || n === 13;
    const freezeTime = roundTime(c.round, c.freezeEnd);
    for (const side of ["CT", "T"] as Side[]) {
      const team = c.roster[side].filter((id) => econ.has(id));
      if (team.length === 0) continue;
      const lost = c.round.winner !== side;
      const avgEquip = team.reduce((s, id) => s + econ.get(id)!.equipValue, 0) / team.length;

      // Force buy that cost the next full buy.
      if (!pistol && n < 24 && !isLastOfHalf(n)) {
        const prev = ctxByNumber.get(n - 1)?.round;
        const matchPoint = prev ? Math.max(prev.ctScore, prev.tScore) >= 12 : false;
        const nextEcon = econBy.get(n + 1);
        const nextCtx = ctxByNumber.get(n + 1);
        const forced = avgEquip >= 1500 && avgEquip < FULL_BUY_EQUIP;
        if (forced) for (const id of team) if (econ.get(id)!.equipValue >= 1500) out.get(id)!.forceRounds++;
        if (forced && lost && !matchPoint && nextEcon && nextCtx && halfOf(n + 1) === halfOf(n)) {
          const nextTeam = nextCtx.roster[side].filter((id) => nextEcon.has(id));
          const nextAvg = nextTeam.length
            ? nextTeam.reduce((s, id) => s + nextEcon.get(id)!.equipValue, 0) / nextTeam.length
            : FULL_BUY_EQUIP;
          let streak = 1;
          for (let r = n - 1; r >= 1 && halfOf(r) === halfOf(n); r--) {
            const pr = ctxByNumber.get(r)?.round;
            if (!pr || pr.winner === side) break;
            streak++;
          }
          const saved = team.reduce((s, id) => s + econ.get(id)!.money + econ.get(id)!.equipValue, 0) +
            team.length * lossBonus(streak);
          if (nextAvg < FULL_BUY_EQUIP && saved >= team.length * FULL_BUY_EQUIP) {
            for (const id of team) {
              if (econ.get(id)!.equipValue < 1500) continue;
              out.get(id)!.badForces++;
              push(id, {
                type: "bad_force",
                roundNumber: n,
                tick: c.freezeEnd,
                roundTime: freezeTime,
                value: Math.round(avgEquip),
                values: [
                  { label: "Sprzęt teamu (śr.)", value: Math.round(avgEquip), unit: "$", ref: FULL_BUY_EQUIP },
                  { label: "Następna runda (śr.)", value: Math.round(nextAvg), unit: "$" },
                  { label: "Po save (szac.)", value: Math.round(saved / team.length), unit: "$" },
                ],
                detail:
                  `force (śr. ${Math.round(avgEquip)} $ sprzętu) przegrany, a w rundzie ${n + 1} team kupił tylko ` +
                  `za ${Math.round(nextAvg)} $; po save miałby ok. ${Math.round(saved / team.length)} $ na gracza`,
                costly: true,
                lost,
              });
            }
          }
        }
      }

      if (pistol) continue;
      // No drop: rich player, broke teammate, team buying.
      const broke = team.filter((id) => econ.get(id)!.equipValue < 2000 && econ.get(id)!.money < 2000);
      const dropped = new Set<string>();
      if (avgEquip >= 3000 && broke.length > 0) {
        for (const id of team) {
          const e = econ.get(id)!;
          if (broke.includes(id) || e.equipValue < 3700 || e.money < DROP_MONEY[side]) continue;
          const mate = broke[0];
          dropped.add(id);
          push(id, {
            type: "no_drop",
            roundNumber: n,
            tick: c.freezeEnd,
            roundTime: freezeTime,
            value: e.money,
            values: [
              { label: "Twoja kasa", value: e.money, unit: "$", ref: DROP_MONEY[side] },
              { label: "Sprzęt kolegi", value: econ.get(mate)!.equipValue, unit: "$" },
            ],
            detail:
              `po zakupach zostało ci ${e.money} $, a ${nameOf.get(mate) ?? "kolega"} grał za ` +
              `${econ.get(mate)!.equipValue} $ sprzętu`,
            costly: lost,
            lost,
          });
        }
      }

      // Died with money that should have been utility or armour.
      for (const id of team) {
        const e = econ.get(id)!;
        const died = c.deathTick.get(id);
        if (died == null || dropped.has(id)) continue;
        const lastRound = isLastOfHalf(n);
        if (!(lastRound ? e.money >= LAST_ROUND_UNSPENT : e.money >= UNSPENT_MONEY && e.equipValue < 5000)) continue;
        push(id, {
          type: "death_with_money",
          variant: lastRound ? "last_round" : "underbuy",
          roundNumber: n,
          tick: died,
          roundTime: roundTime(c.round, died),
          value: e.money,
          values: [
            { label: "Niewydane", value: e.money, unit: "$", ref: lastRound ? LAST_ROUND_UNSPENT : UNSPENT_MONEY },
            { label: "Sprzęt", value: e.equipValue, unit: "$" },
          ],
          detail: lastRound
            ? `ostatnia runda połowy: zginąłeś z ${e.money} $, które po zmianie stron przepadły`
            : `zginąłeś z ${e.money} $ niewydanymi przy sprzęcie za ${e.equipValue} $`,
          costly: true,
          lost,
          enemy: c.kills.find((k) => k.victimSteamId === id)?.attackerSteamId,
        });
      }
    }
  }

  // ── Predictable CT setup spot ──
  const halves = new Map<number, RoundCtx[]>();
  for (const c of ctxs) {
    const list = halves.get(halfOf(c.round.number)) ?? [];
    list.push(c);
    halves.set(halfOf(c.round.number), list);
  }
  for (const player of input.players) {
    const stats = out.get(player.steamId)!;
    for (const list of halves.values()) {
      const anchors: Array<{ c: RoundCtx; pos: Vec; tick: number }> = [];
      for (const c of list) {
        if (c.sideOf.get(player.steamId) !== "CT" || c.round.frames.length === 0) continue;
        const tick = c.freezeEnd + ANCHOR_DELAY_S * tickRate;
        if (tick >= c.round.endTick || !alive(c, player.steamId, tick)) continue;
        if (c.plant && c.plant.tick <= tick) continue;
        const pos = posAt(c, player.steamId, tick);
        if (pos) anchors.push({ c, pos, tick });
      }
      if (anchors.length < 5) continue;
      let best: typeof anchors = [];
      for (const a of anchors) {
        const near = anchors.filter((b) => dist(a.pos, b.pos) <= SAME_SPOT);
        if (near.length > best.length) best = near;
      }
      stats.anchorRounds += anchors.length;
      stats.sameSpotRounds += best.length;
      if (best.length < 4 || best.length / anchors.length < 0.7) continue;

      const share = Math.round((best.length / anchors.length) * 100);
      const repeated = best.slice(3);
      const punished = repeated.filter(({ c, pos }) => {
        const d = c.deathTick.get(player.steamId);
        if (d == null) return false;
        const at = posAt(c, player.steamId, d);
        return at != null && dist(at, pos) <= LEFT_SPOT;
      });
      const moments = punished.length > 0 ? punished : repeated.slice(0, 1);
      for (const { c, tick } of moments) {
        const died = punished.length > 0 ? c.deathTick.get(player.steamId)! : tick;
        const nth = best.findIndex((b) => b.c === c) + 1;
        push(player.steamId, {
          type: "predictable_position",
          roundNumber: c.round.number,
          tick: died,
          roundTime: roundTime(c.round, died),
          value: share,
          values: [
            { label: "Ta sama pozycja", value: share, unit: "%", ref: 70 },
            { label: "Rund z rzędu", value: nth, unit: "" },
          ],
          detail:
            `${nth}. raz w tej połowie na tej samej pozycji (${best.length} z ${anchors.length} rund jako CT)` +
            (punished.length > 0 ? ", wróg cię tam zabił" : ""),
          costly: punished.length > 0,
          lost: c.round.winner !== "CT",
          enemy: punished.length > 0 ? c.kills.find((k) => k.victimSteamId === player.steamId)?.attackerSteamId : undefined,
        });
      }
    }
  }

  for (const p of out.values()) p.moments.sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick);
  return [...out.values()];
}

// ─── Metrics ─────────────────────────────────────────────

export type TacticsSummary = Omit<PlayerTactics, "steamId" | "moments">;
