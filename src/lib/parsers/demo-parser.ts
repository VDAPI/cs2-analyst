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
  ParsedRoundPlayer,
  ParsedBombEvent,
  ParsedGrenade,
  GrenadeType,
  DemoHeader,
} from "@/types";
import { detectClutches, type ClutchInputKill } from "@/lib/utils/clutches";

/**
 * Weapons whose player_hurt damage counts as utility damage.
 *
 * A player_hurt event carries exactly one weapon string and is counted once, so
 * no event can be billed twice no matter how many aliases this set holds.
 *
 * TODO(utility-damage): confirm the fire-damage weapon string against a real demo
 * before touching this set. demoparser2's weapon-name table (visible as strings in
 * wasm/pkg/demoparser2_bg.wasm) holds `molotov`, `incgrenade` and `firebomb` but no
 * bare `inferno` — yet `inferno` is what this codebase has always matched on, here
 * and in the per-grenade damage bucket below. Two risks, both unresolvable without
 * demo data: (a) if burn damage surfaces as `incgrenade`, every CT incendiary is
 * silently dropped and CT utility damage reads low against T; (b) if the engine
 * emits one player_hurt per alias for a single burn tick, an alias-widened set
 * would double-count. Dump the distinct `player_hurt.weapon` values first:
 * `npx tsx scripts/debug-parse.ts <file.dem>`.
 */
const UTILITY_WEAPONS = new Set(["hegrenade", "inferno", "molotov"]);

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

export async function parseDemoFile(rawPath: string): Promise<ParsedDemo> {
  const parser = await getParser();

  // demoparser2 (Rust) can fail with "IllegalPathOp" on Windows-style backslash
  // paths. Normalize to forward slashes before any parser call.
  const filePath = rawPath.replace(/\\/g, "/");
  console.log(`[parseDemoFile] rawPath="${rawPath}" normalized="${filePath}"`);

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
      ctMoney: 0,
      tMoney: 0,
      buyTypeCT: "UNKNOWN",
      buyTypeT: "UNKNOWN",
    });
  }

  // Per-player per-round economy snapshots (populated during freeze-end loop below)
  // Key: `${roundNumber}|${steamId}` -> snapshot
  const roundPlayerEcon = new Map<
    string,
    { roundNumber: number; steamId: string; equipValue: number; money: number; buyType: string }
  >();
  // Per-player per-round damage totals (populated during damage loop below)
  // Key: `${roundNumber}|${steamId}` -> damage
  const damageByRoundPlayer = new Map<string, number>();

  // ── Economy data from round_freeze_end + parseTicks ──
  const freezeEndEvents = parser.parseEvent(filePath, "round_freeze_end") as Record<string, unknown>[] | null;
  if (freezeEndEvents && freezeEndEvents.length > 0 && rounds.length > 0) {
    const freezeTicks = freezeEndEvents
      .filter((e) => num(e.tick) > matchStartTick)
      .sort((a, b) => num(a.tick) - num(b.tick));

    // Map each freeze tick to its round
    const freezeTickToRound = new Map<number, ParsedRound>();
    for (const fe of freezeTicks) {
      const tick = num(fe.tick);
      const roundNum = findRoundNumber(tick);
      const round = rounds.find((r) => r.number === roundNum);
      if (round) freezeTickToRound.set(tick, round);
    }

    if (freezeTickToRound.size > 0) {
      const tickList = Array.from(freezeTickToRound.keys());
      try {
        const tickData = parser.parseTicks(
          filePath,
          ["team_num", "current_equip_value", "balance"],
          tickList
        ) as Array<Record<string, unknown>>;

        // Group tick data by tick
        const byTick = new Map<number, Array<Record<string, unknown>>>();
        for (const td of tickData) {
          const tick = num(td.tick);
          const arr = byTick.get(tick);
          if (arr) arr.push(td);
          else byTick.set(tick, [td]);
        }

        for (const [tick, players] of byTick) {
          const round = freezeTickToRound.get(tick);
          if (!round) continue;

          const isSecondHalf = tick > halftimeTick;

          // team_num: 2=T(second half), 3=CT(second half) from parsePlayerInfo perspective
          // In first half, sides are swapped: team_num=3 plays T, team_num=2 plays CT
          let ctEquipTotal = 0;
          let tEquipTotal = 0;
          let ctMoneyTotal = 0;
          let tMoneyTotal = 0;
          let ctCount = 0;
          let tCount = 0;

          for (const p of players) {
            const teamNum = num(p.team_num);
            if (teamNum !== 2 && teamNum !== 3) continue;

            const equip = num(p.current_equip_value);
            const money = num(p.balance);
            const steamId = str(p.steamid);

            // Determine which side this player is on THIS round
            const isCTSide = isSecondHalf ? teamNum === 3 : teamNum === 2;

            if (isCTSide) {
              ctEquipTotal += equip;
              ctMoneyTotal += money;
              ctCount++;
            } else {
              tEquipTotal += equip;
              tMoneyTotal += money;
              tCount++;
            }

            // Per-player snapshot for RoundPlayer
            if (steamId) {
              roundPlayerEcon.set(`${round.number}|${steamId}`, {
                roundNumber: round.number,
                steamId,
                equipValue: equip,
                money,
                buyType: classifyBuyType(equip, 1, round.number),
              });
            }
          }

          round.ctEquipValue = ctEquipTotal;
          round.tEquipValue = tEquipTotal;
          round.ctMoney = ctMoneyTotal;
          round.tMoney = tMoneyTotal;
          round.buyTypeCT = classifyBuyType(ctEquipTotal, ctCount, round.number);
          round.buyTypeT = classifyBuyType(tEquipTotal, tCount, round.number);
        }
      } catch {
        // parseTicks may fail on some demos — economy data is optional
      }
    }
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
  const utilityDamageByPlayer = new Map<string, number>();

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

    if (UTILITY_WEAPONS.has(str(d.weapon))) {
      utilityDamageByPlayer.set(
        attackerId,
        (utilityDamageByPlayer.get(attackerId) ?? 0) + actualDmg
      );
    }

    const rpKey = `${roundNum}|${attackerId}`;
    damageByRoundPlayer.set(rpKey, (damageByRoundPlayer.get(rpKey) ?? 0) + actualDmg);
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

  // 7. Grenade events
  const grenades: ParsedGrenade[] = [];

  const grenadeEventMap: Array<{ event: string; type: GrenadeType }> = [
    { event: "smokegrenade_detonate", type: "SMOKE" },
    { event: "flashbang_detonate", type: "FLASH" },
    { event: "hegrenade_detonate", type: "HE" },
    { event: "inferno_startburn", type: "MOLOTOV" },
    { event: "decoy_detonate", type: "DECOY" },
  ];

  // Pre-parse flash blind events for flash effectiveness
  const blindEvents = parser.parseEvent(filePath, "player_blind") as Record<string, unknown>[] | null;
  // Group by entityid — each entityid is one flashbang throw
  const blindByEntity = new Map<number, Array<{ victimId: string; duration: number }>>();
  for (const b of blindEvents ?? []) {
    const eid = num(b.entityid);
    const victimId = str(b.user_steamid);
    const attackerId = str(b.attacker_steamid);
    if (!victimId || !attackerId) continue;
    // Skip team flashes: only count enemies
    const attackerInfo = playerRoster.get(attackerId);
    const victimInfo = playerRoster.get(victimId);
    if (attackerInfo && victimInfo && attackerInfo.team === victimInfo.team) continue;
    const arr = blindByEntity.get(eid);
    const entry = { victimId, duration: num(b.blind_duration) };
    if (arr) arr.push(entry);
    else blindByEntity.set(eid, [entry]);
  }

  // Pre-parse grenade damage from player_hurt (HE + molotov/inferno)
  const grenadeDmgByAttackerTick = new Map<string, number>();
  for (const d of damageEvents ?? []) {
    const weapon = str(d.weapon);
    if (weapon !== "hegrenade" && weapon !== "inferno" && weapon !== "molotov") continue;
    const tick = num(d.tick);
    if (tick <= matchStartTick) continue;
    const attackerId = str(d.attacker_steamid);
    if (!attackerId) continue;
    // Key: attackerId + tick bucket (±32 ticks grouped together)
    const bucket = Math.round(tick / 64) * 64;
    const key = `${attackerId}:${bucket}`;
    grenadeDmgByAttackerTick.set(key, (grenadeDmgByAttackerTick.get(key) ?? 0) + num(d.dmg_health));
  }

  for (const { event, type } of grenadeEventMap) {
    const events = parser.parseEvent(filePath, event, ["X", "Y", "Z"]) as Record<string, unknown>[] | null;
    for (const e of events ?? []) {
      const tick = num(e.tick);
      if (tick <= matchStartTick) continue;

      const throwerSteamId = str(e.user_steamid);
      if (!throwerSteamId) continue;

      const entityId = num(e.entityid);

      // Flash: count enemies blinded from player_blind
      let playersFlashed = 0;
      let totalBlindDuration = 0;
      if (type === "FLASH") {
        const blinds = blindByEntity.get(entityId);
        if (blinds) {
          playersFlashed = blinds.length;
          totalBlindDuration = blinds.reduce((sum, b) => sum + b.duration, 0);
        }
      }

      // HE/Molotov: sum damage from player_hurt near this tick
      let damageDealt = 0;
      if (type === "HE" || type === "MOLOTOV") {
        const bucket = Math.round(tick / 64) * 64;
        const key = `${throwerSteamId}:${bucket}`;
        damageDealt = grenadeDmgByAttackerTick.get(key) ?? 0;
      }

      grenades.push({
        tick,
        roundNumber: findRoundNumber(tick),
        throwerSteamId,
        throwerName: str(e.user_name),
        type,
        throwPos: { x: num(e.user_X), y: num(e.user_Y), z: num(e.user_Z) },
        landPos: { x: num(e.x), y: num(e.y), z: num(e.z) },
        trajectory: [],
        duration: type === "FLASH" ? Math.round(totalBlindDuration * 1000) : (num(e.duration) || undefined),
        damageDealt,
        playersFlashed,
      });
    }
  }

  // Sort grenades by tick
  grenades.sort((a, b) => a.tick - b.tick);

  // 8. Aggregate player stats
  // Start from the authoritative roster (parsePlayerInfo), then enrich with kill data
  const playerStats = new Map<string, {
    steamId: string;
    name: string;
    team: "CT" | "T";
    kills: number;
    deaths: number;
    assists: number;
    flashAssists: number;
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
      flashAssists: 0,
      hsKills: 0,
      firstKills: 0,
      firstDeaths: 0,
    });
  }

  // Count kills and deaths from kill events
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
  }

  // Assists are tallied separately — see computeAssistCounts for why flash
  // assists are excluded from the regular assist total.
  for (const [steamId, counts] of computeAssistCounts(kills, playerRoster.keys())) {
    const p = playerStats.get(steamId);
    if (!p) continue;
    p.assists = counts.assists;
    p.flashAssists = counts.flashAssists;
  }

  // 9. Clutch detection (1vX)
  const clutchWinsByPlayer = computeClutchWins({
    rounds,
    kills,
    playerRoster,
    halftimeTick,
  });

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
      utilityDamage: Math.round(utilityDamageByPlayer.get(p.steamId) ?? 0),
      flashAssists: p.flashAssists,
      clutchWins: clutchWinsByPlayer.get(p.steamId) ?? 0,
      firstKills: p.firstKills,
      firstDeaths: p.firstDeaths,
    };
  });

  // Build RoundPlayer rows: union of econ snapshots and damage totals.
  const roundPlayerKeys = new Set<string>([
    ...roundPlayerEcon.keys(),
    ...damageByRoundPlayer.keys(),
  ]);
  const roundPlayers: ParsedRoundPlayer[] = [];
  for (const key of roundPlayerKeys) {
    const sep = key.indexOf("|");
    const roundNumber = Number(key.slice(0, sep));
    const steamId = key.slice(sep + 1);
    const econ = roundPlayerEcon.get(key);
    roundPlayers.push({
      roundNumber,
      steamId,
      equipValue: econ?.equipValue ?? 0,
      money: econ?.money ?? 0,
      damage: damageByRoundPlayer.get(key) ?? 0,
      buyType: econ?.buyType ?? "UNKNOWN",
    });
  }

  return {
    header,
    rounds,
    players,
    kills,
    grenades,
    bombEvents,
    roundPlayers,
    ticks: [],
  };
}

export interface AssistCounts {
  assists: number;
  flashAssists: number;
}

/**
 * Tally assists per player, keyed by steamId.
 *
 * DESIGN DECISION — deliberate divergence from HLTV. `assists` and `flashAssists`
 * are disjoint: a kill whose assist came from a flashbang increments `flashAssists`
 * only, never both counters. HLTV folds flash assists into the regular assist
 * total; we keep them apart so a utility contribution is not also billed as
 * fragging support, and so the two columns can be read independently.
 *
 * Do NOT "align this with HLTV" by incrementing both — the split is the point.
 * Anything comparing our assist totals against HLTV's must add the columns back
 * together at the call site.
 */
export function computeAssistCounts(
  kills: Pick<ParsedKill, "assisterSteamId" | "flashAssisted">[],
  knownSteamIds: Iterable<string>
): Map<string, AssistCounts> {
  const counts = new Map<string, AssistCounts>();
  for (const steamId of knownSteamIds) {
    counts.set(steamId, { assists: 0, flashAssists: 0 });
  }

  for (const k of kills) {
    if (!k.assisterSteamId) continue;
    const c = counts.get(k.assisterSteamId);
    if (!c) continue;
    if (k.flashAssisted) c.flashAssists++;
    else c.assists++;
  }

  return counts;
}

export interface ClutchWinsInput {
  rounds: Pick<ParsedRound, "number" | "winner" | "endTick">[];
  kills: Pick<ParsedKill, "tick" | "roundNumber" | "attackerSteamId" | "victimSteamId">[];
  /** steamId → side at END of match (as reported by parsePlayerInfo). */
  playerRoster: Map<string, { team: "CT" | "T" }>;
  /** Rounds ending after this tick belong to the second half. */
  halftimeTick: number;
}

/**
 * Count won 1vX clutches per player.
 *
 * A round's `winner` is an absolute side, but `playerRoster` holds end-of-match
 * sides. Each half is therefore resolved against the side map that was actually
 * in play — using the roster verbatim would invert the won/lost flag on every
 * first-half clutch.
 */
export function computeClutchWins({
  rounds,
  kills,
  playerRoster,
  halftimeTick,
}: ClutchWinsInput): Map<string, number> {
  const clutchWinsByPlayer = new Map<string, number>();

  const killsByRound = new Map<number, ClutchInputKill[]>();
  for (const k of kills) {
    const entry: ClutchInputKill = {
      tick: k.tick,
      attackerSteamId: k.attackerSteamId,
      victimSteamId: k.victimSteamId,
    };
    const list = killsByRound.get(k.roundNumber);
    if (list) list.push(entry);
    else killsByRound.set(k.roundNumber, [entry]);
  }

  for (const isSecondHalf of [false, true]) {
    const halfRounds = rounds.filter(
      (r) => (r.endTick > halftimeTick) === isSecondHalf
    );
    if (halfRounds.length === 0) continue;

    const teamBySteamId = new Map<string, "CT" | "T">();
    for (const [steamId, info] of playerRoster) {
      teamBySteamId.set(
        steamId,
        isSecondHalf ? info.team : info.team === "CT" ? "T" : "CT"
      );
    }

    const clutches = detectClutches({
      rounds: halfRounds.map((r) => ({
        id: String(r.number),
        number: r.number,
        winner: r.winner,
        kills: killsByRound.get(r.number) ?? [],
      })),
      teamBySteamId,
    });

    for (const c of clutches) {
      if (!c.won) continue;
      clutchWinsByPlayer.set(
        c.clutcherSteamId,
        (clutchWinsByPlayer.get(c.clutcherSteamId) ?? 0) + 1
      );
    }
  }

  return clutchWinsByPlayer;
}

/**
 * Classify buy type based on total team equipment value.
 * SKILL.md thresholds:
 * - Pistol round: rounds 1 and 13
 * - Eco: avg equip < $1000 per player
 * - Half buy: avg equip $1000-$2500
 * - Force buy: avg equip $2500-$4000
 * - Full buy: avg equip >= $4000
 */
function classifyBuyType(totalEquip: number, playerCount: number, roundNumber: number): string {
  if (roundNumber === 1 || roundNumber === 13) return "PISTOL";
  if (playerCount === 0) return "UNKNOWN";

  const avgEquip = totalEquip / playerCount;
  if (avgEquip < 1000) return "ECO";
  if (avgEquip < 2500) return "HALF_BUY";
  if (avgEquip < 4000) return "FORCE_BUY";
  return "FULL_BUY";
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
