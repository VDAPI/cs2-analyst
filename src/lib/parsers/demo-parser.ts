/**
 * Demo Parser Service
 *
 * Wraps @laihoe/demoparser2 (Rust-based) to extract structured data
 * from CS2 .dem files. Runs server-side only (Node.js bindings).
 */

import type {
  ParsedDemo,
  ParsedKill,
  ParsedPlayer,
  ParsedRound,
  ParsedBombEvent,
  DemoHeader,
} from "@/types";

// Dynamic import — demoparser2 uses native Node bindings
let demoparser: typeof import("@laihoe/demoparser2") | null = null;

async function getParser() {
  if (!demoparser) {
    demoparser = await import("@laihoe/demoparser2");
  }
  return demoparser;
}

// ─── Helper: safe field access ────────────────────────────

function num(val: unknown, fallback = 0): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val) || fallback;
  return fallback;
}

function str(val: unknown, fallback = ""): string {
  if (typeof val === "string") return val;
  if (val != null) return String(val);
  return fallback;
}

function bool(val: unknown): boolean {
  if (val === true || val === "true") return true;
  if (typeof val === "number") return val > 0;
  return false;
}

// ─── Main parser ─────────────────────────────────────────

export async function parseDemoFile(filePath: string): Promise<ParsedDemo> {
  const parser = await getParser();

  // 1. Header
  const rawHeader = parser.parseHeader(filePath);
  const header: DemoHeader = {
    map: str(rawHeader?.map_name, "unknown"),
    duration: num(rawHeader?.playback_time),
    tickRate: num(rawHeader?.tickrate, 64),
    totalTicks: num(rawHeader?.playback_ticks),
    date: new Date(),
    server: str(rawHeader?.server_name),
    scoreCT: 0,
    scoreT: 0,
  };

  // 2. Player roster from parsePlayerInfo (authoritative source)
  const playerInfoRaw = parser.parsePlayerInfo(filePath) as {
    name: string;
    steamid: string;
    team_number: number;
  }[];

  // team_number: 2 = T, 3 = CT
  const playerRoster = new Map<string, { name: string; team: "CT" | "T" }>();
  for (const p of playerInfoRaw ?? []) {
    if (!p.steamid) continue;
    playerRoster.set(p.steamid, {
      name: p.name,
      team: p.team_number === 2 ? "T" : "CT",
    });
  }

  // 3. Detect real match start (skip knife round in FACEIT demos)
  // begin_new_match fires twice in FACEIT: once at start, once after knife round.
  // The LAST occurrence marks the real match start.
  const beginMatchEvents = parser.parseEvent(filePath, "begin_new_match") as Record<string, unknown>[] | null;
  let matchStartTick = 0;
  if (beginMatchEvents && beginMatchEvents.length > 0) {
    const sorted = beginMatchEvents.sort((a, b) => num(a.tick) - num(b.tick));
    matchStartTick = num(sorted[sorted.length - 1].tick);
  }

  // Detect halftime using announce_phase_end (marks end of first half)
  const phaseEndEvents = parser.parseEvent(filePath, "announce_phase_end") as Record<string, unknown>[] | null;
  let halftimeTick = Infinity; // default: no halftime detected means all rounds are first half
  if (phaseEndEvents && phaseEndEvents.length > 0) {
    // The first announce_phase_end after match start is halftime
    const sorted = (phaseEndEvents)
      .filter((e) => num(e.tick) > matchStartTick)
      .sort((a, b) => num(a.tick) - num(b.tick));
    if (sorted.length > 0) {
      halftimeTick = num(sorted[0].tick);
    }
  }

  // 4. Round results from round_end events
  const roundEndEvents = parser.parseEvent(filePath, "round_end") as Record<string, unknown>[];
  const roundStartEvents = parser.parseEvent(filePath, "round_start") as Record<string, unknown>[];

  const sortedStarts = (roundStartEvents ?? []).sort((a, b) => num(a.tick) - num(b.tick));

  // Filter: skip null winners AND skip rounds before real match start (knife round)
  const realRoundEnds = (roundEndEvents ?? [])
    .filter((e) => e.winner != null && str(e.winner) !== "" && num(e.tick) > matchStartTick)
    .sort((a, b) => num(a.tick) - num(b.tick));

  // Team mapping from parsePlayerInfo:
  // team_number gives the team at END of match (second half sides).
  // In first half, sides are OPPOSITE. We track "teamA" (team_number=3) and "teamB" (team_number=2).
  // teamA is CT-side in second half → T-side in first half
  // teamB is T-side in second half → CT-side in first half
  // First half: CT win → teamB point, T win → teamA point
  // Second half: CT win → teamA point, T win → teamB point

  interface RoundBoundary {
    number: number;
    startTick: number;
    endTick: number;
  }
  const boundaries: RoundBoundary[] = [];
  const rounds: ParsedRound[] = [];
  let teamAScore = 0; // team_number=3 (CT in second half)
  let teamBScore = 0; // team_number=2 (T in second half)

  for (let i = 0; i < realRoundEnds.length; i++) {
    const end = realRoundEnds[i];
    const roundNum = i + 1;
    const endTick = num(end.tick);

    // Find the start tick: last round_start before this round_end (and after match start)
    let startTick = matchStartTick;
    for (const s of sortedStarts) {
      const sTick = num(s.tick);
      if (sTick >= matchStartTick && sTick < endTick) startTick = sTick;
      else if (sTick >= endTick) break;
    }

    const winnerStr = str(end.winner);
    const winner: "CT" | "T" = winnerStr === "T" ? "T" : "CT";

    const isSecondHalf = endTick > halftimeTick;

    // Map side win to team win
    if (isSecondHalf) {
      // Second half: CT = teamA, T = teamB
      if (winner === "CT") teamAScore++;
      else teamBScore++;
    } else {
      // First half: CT = teamB, T = teamA
      if (winner === "CT") teamBScore++;
      else teamAScore++;
    }

    boundaries.push({ number: roundNum, startTick, endTick });

    // Map reason string to our enum
    const reasonStr = str(end.reason).toLowerCase();
    let winReason = "ELIMINATION";
    if (reasonStr.includes("bomb_exploded")) winReason = "BOMB_EXPLODED";
    else if (reasonStr.includes("bomb_defused") || reasonStr.includes("defuse")) winReason = "BOMB_DEFUSED";
    else if (reasonStr.includes("time") || reasonStr.includes("target_saved")) winReason = "TIME_RAN_OUT";

    rounds.push({
      number: roundNum,
      winner,
      winReason,
      startTick,
      endTick,
      ctScore: teamAScore,
      tScore: teamBScore,
      ctEquipValue: 0,
      tEquipValue: 0,
    });
  }

  // header.scoreCT = teamA score (team_number=3, CT in second half)
  // header.scoreT = teamB score (team_number=2, T in second half)
  header.scoreCT = teamAScore;
  header.scoreT = teamBScore;

  const totalRounds = rounds.length || 1;

  // Helper: find round number for a given tick
  function findRoundNumber(tick: number): number {
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (tick >= boundaries[i].startTick) return boundaries[i].number;
    }
    return 1;
  }

  // 4. Kill events
  const killEvents = parser.parseEvent(filePath, "player_death", [
    "X", "Y", "Z",
  ]) as Record<string, unknown>[];

  const kills: ParsedKill[] = [];
  const firstKillTicks = new Map<number, number>();

  for (const k of killEvents ?? []) {
    const tick = num(k.tick);
    const attackerId = str(k.attacker_steamid);
    const victimId = str(k.user_steamid);

    // Skip kills with no attacker or victim (e.g. world damage)
    if (!attackerId || !victimId) continue;

    const roundNum = findRoundNumber(tick);

    // Skip warmup/knife kills (before real match start)
    if (tick <= matchStartTick) continue;

    const existing = firstKillTicks.get(roundNum);
    if (existing === undefined || tick < existing) {
      firstKillTicks.set(roundNum, tick);
    }

    kills.push({
      tick,
      roundNumber: roundNum,
      attackerSteamId: attackerId,
      attackerName: str(k.attacker_name),
      victimSteamId: victimId,
      victimName: str(k.user_name),
      assisterSteamId: k.assister_steamid ? str(k.assister_steamid) : undefined,
      weapon: str(k.weapon),
      headshot: bool(k.headshot),
      wallbang: bool(k.penetrated),
      throughSmoke: bool(k.thrusmoke),
      noScope: bool(k.noscope),
      flashAssisted: bool(k.assistedflash),
      attackerPos: {
        x: num(k.attacker_X),
        y: num(k.attacker_Y),
        z: num(k.attacker_Z),
      },
      victimPos: {
        x: num(k.user_X),
        y: num(k.user_Y),
        z: num(k.user_Z),
      },
      isFirstKill: false,
    });
  }

  // Mark first kills
  for (const kill of kills) {
    if (firstKillTicks.get(kill.roundNumber) === kill.tick) {
      kill.isFirstKill = true;
    }
  }

  // 5. Damage events (for ADR)
  // Track HP per player per round to correctly cap overkill damage.
  // Also filter out friendly fire by comparing attacker/victim teams.
  const damageEvents = parser.parseEvent(filePath, "player_hurt") as Record<string, unknown>[];
  const damageByPlayer = new Map<string, number>();

  // Sort damage events by tick to correctly track HP drain within a round
  const sortedDamage = (damageEvents ?? [])
    .filter((d) => num(d.tick) > matchStartTick)
    .sort((a, b) => num(a.tick) - num(b.tick));

  // HP tracker: reset to 100 for each player at round start
  const playerHp = new Map<string, number>();
  let currentRoundForHp = 0;

  for (const d of sortedDamage) {
    const attackerId = str(d.attacker_steamid);
    const victimId = str(d.user_steamid);
    if (!attackerId || !victimId) continue;

    // Skip self-damage
    if (attackerId === victimId) continue;

    // Skip friendly fire: check if attacker and victim are on the same team
    // Use playerRoster (end-of-match teams) — teammates have the same team_number
    const attackerInfo = playerRoster.get(attackerId);
    const victimInfo = playerRoster.get(victimId);
    if (attackerInfo && victimInfo && attackerInfo.team === victimInfo.team) continue;

    const tick = num(d.tick);
    const roundNum = findRoundNumber(tick);

    // Reset HP tracker at new round
    if (roundNum !== currentRoundForHp) {
      currentRoundForHp = roundNum;
      playerHp.clear();
    }

    // Get victim's current HP (default 100 at round start)
    const victimHp = playerHp.get(victimId) ?? 100;
    const rawDmg = num(d.dmg_health);
    const actualDmg = Math.min(rawDmg, victimHp);

    // Update victim's HP
    playerHp.set(victimId, Math.max(0, victimHp - actualDmg));

    damageByPlayer.set(attackerId, (damageByPlayer.get(attackerId) ?? 0) + actualDmg);
  }

  // 6. Bomb events
  const bombPlanted = parser.parseEvent(filePath, "bomb_planted", ["X", "Y", "Z"]) as Record<string, unknown>[];
  const bombDefused = parser.parseEvent(filePath, "bomb_defused", ["X", "Y", "Z"]) as Record<string, unknown>[];
  const bombExploded = parser.parseEvent(filePath, "bomb_exploded", ["X", "Y", "Z"]) as Record<string, unknown>[];

  const bombEvents: ParsedBombEvent[] = [];

  function parseBombEvents(events: Record<string, unknown>[] | null, type: string) {
    for (const b of events ?? []) {
      const tick = num(b.tick);
      if (tick <= matchStartTick) continue;
      bombEvents.push({
        tick,
        roundNumber: findRoundNumber(tick),
        type,
        playerSteamId: str(b.user_steamid),
        pos: { x: num(b.user_X), y: num(b.user_Y), z: num(b.user_Z) },
        site: str(b.site) as "A" | "B" | undefined,
      });
    }
  }

  parseBombEvents(bombPlanted, "PLANTED");
  parseBombEvents(bombDefused, "DEFUSED");
  parseBombEvents(bombExploded, "EXPLODED");

  // 7. Aggregate player stats
  // Start from the authoritative roster (parsePlayerInfo), then enrich with kill data
  const playerStats = new Map<string, {
    steamId: string;
    name: string;
    team: "CT" | "T";
    kills: number;
    deaths: number;
    assists: number;
    hsKills: number;
    firstKills: number;
    firstDeaths: number;
  }>();

  // Initialize all 10 players from roster
  for (const [steamId, info] of playerRoster) {
    playerStats.set(steamId, {
      steamId,
      name: info.name,
      team: info.team,
      kills: 0,
      deaths: 0,
      assists: 0,
      hsKills: 0,
      firstKills: 0,
      firstDeaths: 0,
    });
  }

  // Count kills, deaths, assists from kill events
  for (const k of kills) {
    const attacker = playerStats.get(k.attackerSteamId);
    const victim = playerStats.get(k.victimSteamId);

    if (attacker && k.attackerSteamId !== k.victimSteamId) {
      attacker.kills++;
      if (k.headshot) attacker.hsKills++;
      if (k.isFirstKill) attacker.firstKills++;
    }

    if (victim) {
      victim.deaths++;
      if (k.isFirstKill) victim.firstDeaths++;
    }

    if (k.assisterSteamId) {
      const assister = playerStats.get(k.assisterSteamId);
      if (assister) assister.assists++;
    }
  }

  // Build final player list
  const players: ParsedPlayer[] = Array.from(playerStats.values()).map((p) => {
    const totalDamage = damageByPlayer.get(p.steamId) ?? 0;
    const adr = totalDamage / totalRounds;
    const hsPercent = p.kills > 0 ? (p.hsKills / p.kills) * 100 : 0;

    // Simplified HLTV 2.1 rating
    const kpr = p.kills / totalRounds;
    const dpr = p.deaths / totalRounds;
    const impact = 2.13 * kpr + 0.42 * (p.assists / totalRounds) - 0.41;
    const kast = 70; // approximate for MVP
    const hltvRating =
      0.0073 * kast +
      0.3591 * kpr -
      0.5329 * dpr +
      0.2372 * Math.max(impact, 0) +
      0.0032 * adr +
      0.1587;

    return {
      steamId: p.steamId,
      name: p.name,
      team: p.team,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      adr: Math.round(adr * 10) / 10,
      hltvRating: Math.round(Math.max(hltvRating, 0) * 100) / 100,
      hsPercent: Math.round(hsPercent * 10) / 10,
      utilityDamage: 0,
      flashAssists: 0,
      firstKills: p.firstKills,
      firstDeaths: p.firstDeaths,
    };
  });

  return {
    header,
    rounds,
    players,
    kills,
    grenades: [],
    bombEvents,
    ticks: [],
  };
}

/**
 * Quick parse — only extract scoreboard data (fast, no tick data).
 */
export async function parseScoreboard(
  filePath: string
): Promise<ParsedPlayer[]> {
  const result = await parseDemoFile(filePath);
  return result.players;
}
