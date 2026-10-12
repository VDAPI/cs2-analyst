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
import { detectClutchesBySide, type ClutchInputKill } from "@/lib/utils/clutches";
import { otherSide, ruleSideAtRound, sideInRound, type Side } from "@/lib/utils/sideSplit";
import { parseRoundWinner, parseWinReason } from "@/lib/parsers/round-end";
import { loadDemoParser } from "./load-parser";

/**
 * Weapons whose player_hurt damage counts as utility damage.
 *
 * A player_hurt event carries exactly one weapon string and is counted once, so
 * no event can be billed twice no matter how many aliases this set holds.
 * Fire damage arrives as `inferno` (checked on a real CS2 demo with
 * demoparser2 0.41.3: `npx tsx scripts/debug-parse.ts <file.dem>` dumps the
 * distinct `player_hurt.weapon` values).
 */
const UTILITY_WEAPONS = new Set(["hegrenade", "inferno", "molotov"]);
const FIRE_WEAPONS = new Set(["inferno", "molotov"]);

// demoparser2 (native bindings), or the E2E fixture parser.
const getParser = loadDemoParser;

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
    // CS2 headers carry neither of these; both are derived from the rounds below.
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

  // team_number: 2 = T, 3 = CT — the side the player FINISHED the match on.
  // It identifies the team (teammates share it); never compare it to a
  // round-level side without resolving the side for that round.
  const playerRoster = new Map<string, { name: string; team: "CT" | "T" }>();
  for (const p of playerInfoRaw ?? []) {
    if (!p.steamid) continue;
    playerRoster.set(p.steamid, {
      name: p.name,
      team: p.team_number === 2 ? "T" : "CT",
    });
  }
  const sameTeam = (a: string, b: string) => {
    const ta = playerRoster.get(a)?.team;
    return ta !== undefined && ta === playerRoster.get(b)?.team;
  };

  // 3. Detect real match start (skip knife round in FACEIT demos)
  // begin_new_match fires twice in FACEIT: once at start, once after knife round.
  // The LAST occurrence marks the real match start.
  const beginMatchEvents = parser.parseEvent(filePath, "begin_new_match") as Record<string, unknown>[] | null;
  let matchStartTick = 0;
  if (beginMatchEvents && beginMatchEvents.length > 0) {
    const sorted = beginMatchEvents.sort((a, b) => num(a.tick) - num(b.tick));
    matchStartTick = num(sorted[sorted.length - 1].tick);
  }

  // 4. Round results from round_end events
  const roundEndEvents = parser.parseEvent(filePath, "round_end") as Record<string, unknown>[];
  const roundStartEvents = parser.parseEvent(filePath, "round_start") as Record<string, unknown>[];

  const sortedStarts = (roundStartEvents ?? []).sort((a, b) => num(a.tick) - num(b.tick));

  // Skip rounds without a winner (draws, restarts) AND rounds before the real
  // match start (knife round). demoparser2 0.41 returns winner/reason as
  // numbers (2 = T, 3 = CT; CS2 RoundEndReason) — see round-end.ts.
  const realRoundEnds = (roundEndEvents ?? [])
    .filter((e) => num(e.tick) > matchStartTick && parseRoundWinner(e.winner, e.message) !== null)
    .sort((a, b) => num(a.tick) - num(b.tick));

  interface RoundBoundary {
    number: number;
    startTick: number;
    endTick: number;
  }
  const boundaries: RoundBoundary[] = [];
  const rounds: ParsedRound[] = [];

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

    boundaries.push({ number: roundNum, startTick, endTick });

    rounds.push({
      number: roundNum,
      winner: parseRoundWinner(end.winner, end.message) ?? "CT",
      winReason: parseWinReason(end.reason, end.message),
      startTick,
      endTick,
      ctScore: 0,
      tScore: 0,
      ctEquipValue: 0,
      tEquipValue: 0,
      ctMoney: 0,
      tMoney: 0,
      buyTypeCT: "UNKNOWN",
      buyTypeT: "UNKNOWN",
    });
  }

  // Events after the match is over (cs_win_panel_match — e.g. the "world"
  // suicides when players leave the server) must not count. Without a win
  // panel, allow a short grace after the last round_end for exit frags.
  const lastRoundEndTick = boundaries.length ? boundaries[boundaries.length - 1].endTick : Infinity;
  let matchEndTick = lastRoundEndTick + Math.round(header.tickRate * 5);
  try {
    const winPanel = (parser.parseEvent(filePath, "cs_win_panel_match") as Record<string, unknown>[] | null) ?? [];
    const panelTicks = winPanel
      .map((e) => num(e.tick))
      .filter((t) => t >= lastRoundEndTick)
      .sort((a, b) => a - b);
    if (panelTicks.length > 0) matchEndTick = panelTicks[0];
  } catch {
    // optional event
  }
  const inMatch = (tick: number) => tick > matchStartTick && tick <= matchEndTick;

  // Per-player per-round economy snapshots (populated during freeze-end loop below)
  // Key: `${roundNumber}|${steamId}` -> snapshot
  const roundPlayerEcon = new Map<
    string,
    { roundNumber: number; steamId: string; equipValue: number; money: number; buyType: string }
  >();
  // Per-player per-round damage totals (populated during damage loop below)
  // Key: `${roundNumber}|${steamId}` -> damage
  const damageByRoundPlayer = new Map<string, number>();

  // ── Live sides + economy from parseTicks ──
  // One sample tick per round: its round_freeze_end (economy is read there),
  // or the tick before round_end for a round without one (e.g. a surrender
  // called in freezetime). `team_num` on a tick is the player's LIVE side
  // (2 = T, 3 = CT) — unlike parsePlayerInfo.team_number it needs no per-half
  // flipping.
  const freezeEndEvents = parser.parseEvent(filePath, "round_freeze_end") as Record<string, unknown>[] | null;
  const freezeTickSet = new Set<number>();
  const sampleTickToRound = new Map<number, ParsedRound>();
  {
    const freezeTicks = (freezeEndEvents ?? [])
      .map((e) => num(e.tick))
      .filter((t) => t > matchStartTick)
      .sort((a, b) => a - b);
    for (const b of boundaries) {
      const round = rounds[b.number - 1];
      const ft = freezeTicks.find((t) => t >= b.startTick && t < b.endTick);
      if (ft !== undefined) {
        freezeTickSet.add(ft);
        sampleTickToRound.set(ft, round);
      } else {
        sampleTickToRound.set(Math.max(b.startTick, b.endTick - 1), round);
      }
    }
  }

  // Live samples per round: steamId → team_num.
  const liveTeamsByRound = new Map<number, Map<string, number>>();
  if (sampleTickToRound.size > 0) {
    try {
      const tickData = parser.parseTicks(
        filePath,
        ["team_num", "current_equip_value", "balance"],
        Array.from(sampleTickToRound.keys())
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
        const round = sampleTickToRound.get(tick);
        if (!round) continue;
        const isFreezeEnd = freezeTickSet.has(tick);

        const live = new Map<string, number>();
        let ctEquipTotal = 0;
        let tEquipTotal = 0;
        let ctMoneyTotal = 0;
        let tMoneyTotal = 0;
        let ctCount = 0;
        let tCount = 0;

        for (const p of players) {
          const teamNum = num(p.team_num);
          if (teamNum !== 2 && teamNum !== 3) continue;

          const steamId = str(p.steamid);
          if (steamId) live.set(steamId, teamNum);
          if (!isFreezeEnd) continue;

          const equip = num(p.current_equip_value);
          const money = num(p.balance);

          // Live side on this tick — no half logic.
          if (teamNum === 3) {
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
        liveTeamsByRound.set(round.number, live);

        if (!isFreezeEnd) continue;
        round.ctEquipValue = ctEquipTotal;
        round.tEquipValue = tEquipTotal;
        round.ctMoney = ctMoneyTotal;
        round.tMoney = tMoneyTotal;
        round.buyTypeCT = classifyBuyType(ctEquipTotal, ctCount, round.number);
        round.buyTypeT = classifyBuyType(tEquipTotal, tCount, round.number);
      }
    } catch {
      // parseTicks may fail on some demos — economy is optional and sides
      // fall back to the MR12/MR3 rule.
    }
  }

  // teamA = players who finished on CT, teamB = players who finished on T.
  // header.scoreCT / Round.ctScore hold teamA's score, scoreT / tScore teamB's.
  const teamASideByRound = resolveTeamASides({
    roundNumbers: rounds.map((r) => r.number),
    liveTeamsByRound,
    playerRoster,
  });
  const score = scoreRounds(rounds, teamASideByRound);
  header.scoreCT = score.teamA;
  header.scoreT = score.teamB;

  // CS2 demo headers carry no playback time/ticks — derive them from the rounds.
  if (boundaries.length > 0) {
    if (!header.totalTicks) header.totalTicks = lastRoundEndTick;
    if (!header.duration) {
      header.duration = Math.max(
        0,
        Math.round((lastRoundEndTick - boundaries[0].startTick) / header.tickRate)
      );
    }
  }

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

  // Victim's inventory at death ("died with unused utility", S11). Separate
  // pass so a parser that can't read the prop still gets every kill.
  const inventoryAtDeath = new Map<string, string[]>();
  try {
    const withInventory = parser.parseEvent(filePath, "player_death", ["inventory"]) as
      | Record<string, unknown>[]
      | null;
    for (const k of withInventory ?? []) {
      const inv = k.user_inventory;
      if (Array.isArray(inv)) {
        inventoryAtDeath.set(`${num(k.tick)}|${str(k.user_steamid)}`, inv.map((x) => String(x)));
      }
    }
  } catch (err) {
    console.warn("[demo-parser] inventory at death unavailable:", err);
  }

  /** A kill that credits nobody: suicide / world death or a team kill. */
  const isNonEnemyKill = (k: Pick<ParsedKill, "attackerSteamId" | "victimSteamId">) =>
    k.attackerSteamId === k.victimSteamId || sameTeam(k.attackerSteamId, k.victimSteamId);

  for (const k of killEvents ?? []) {
    const tick = num(k.tick);
    // Skip warmup/knife kills and post-match deaths
    if (!inMatch(tick)) continue;

    const victimId = str(k.user_steamid);
    if (!victimId) continue;
    // A death without an attacker (fall, bomb, world) is recorded like a
    // suicide: the victim's death counts, nobody gets the kill.
    const rawAttackerId = str(k.attacker_steamid);
    const attackerId = rawAttackerId || victimId;

    const roundNum = findRoundNumber(tick);

    const kill: ParsedKill = {
      tick,
      roundNumber: roundNum,
      attackerSteamId: attackerId,
      attackerName: rawAttackerId ? str(k.attacker_name) : str(k.user_name),
      victimSteamId: victimId,
      victimName: str(k.user_name),
      assisterSteamId: k.assister_steamid ? str(k.assister_steamid) : undefined,
      weapon: str(k.weapon) || (rawAttackerId ? "" : "world"),
      headshot: bool(k.headshot),
      wallbang: bool(k.penetrated),
      throughSmoke: bool(k.thrusmoke),
      noScope: bool(k.noscope),
      flashAssisted: bool(k.assistedflash),
      // No attacker → no attacker position; use the victim's spot instead of
      // (0,0,0), which kill heatmaps would draw at the world origin.
      attackerPos: rawAttackerId
        ? { x: num(k.attacker_X), y: num(k.attacker_Y), z: num(k.attacker_Z) }
        : { x: num(k.user_X), y: num(k.user_Y), z: num(k.user_Z) },
      victimPos: {
        x: num(k.user_X),
        y: num(k.user_Y),
        z: num(k.user_Z),
      },
      isFirstKill: false,
      victimInventory: inventoryAtDeath.get(`${tick}|${victimId}`) ?? null,
    };

    // Opening duels only count enemy kills (no suicides / team kills)
    if (!isNonEnemyKill(kill)) {
      const existing = firstKillTicks.get(roundNum);
      if (existing === undefined || tick < existing) {
        firstKillTicks.set(roundNum, tick);
      }
    }

    kills.push(kill);
  }

  // Mark first kills
  for (const kill of kills) {
    if (firstKillTicks.get(kill.roundNumber) === kill.tick && !isNonEnemyKill(kill)) {
      kill.isFirstKill = true;
    }
  }

  // 5. Damage events (for ADR)
  // Track HP per player per round to correctly cap overkill damage. Every hurt
  // event updates the tracker (self, team and world damage too); only damage
  // to enemies is credited.
  const damageEvents = parser.parseEvent(filePath, "player_hurt") as Record<string, unknown>[];
  const damageByPlayer = new Map<string, number>();
  const utilityDamageByPlayer = new Map<string, number>();
  /** Credited (capped, enemy-only) grenade damage, for per-grenade totals. */
  const grenadeHits: GrenadeHit[] = [];

  // Sort damage events by tick to correctly track HP drain within a round
  const sortedDamage = (damageEvents ?? [])
    .filter((d) => inMatch(num(d.tick)))
    .sort((a, b) => num(a.tick) - num(b.tick));

  // HP tracker: reset to 100 for each player at round start
  const playerHp = new Map<string, number>();
  let currentRoundForHp = 0;

  for (const d of sortedDamage) {
    const victimId = str(d.user_steamid);
    if (!victimId) continue;

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
    const actualDmg = Math.max(0, Math.min(rawDmg, victimHp));

    // Update victim's HP — the event's remaining health when present
    const remaining = typeof d.health === "number" ? d.health : victimHp - actualDmg;
    playerHp.set(victimId, Math.max(0, remaining));

    const attackerId = str(d.attacker_steamid);
    // World damage, self-damage and friendly fire are not credited
    if (!attackerId || attackerId === victimId) continue;
    if (sameTeam(attackerId, victimId)) continue;

    damageByPlayer.set(attackerId, (damageByPlayer.get(attackerId) ?? 0) + actualDmg);

    const weapon = str(d.weapon);
    if (UTILITY_WEAPONS.has(weapon)) {
      utilityDamageByPlayer.set(
        attackerId,
        (utilityDamageByPlayer.get(attackerId) ?? 0) + actualDmg
      );
      grenadeHits.push({
        attackerSteamId: attackerId,
        tick,
        kind: FIRE_WEAPONS.has(weapon) ? "MOLOTOV" : "HE",
        damage: actualDmg,
      });
    }

    const rpKey = `${roundNum}|${attackerId}`;
    damageByRoundPlayer.set(rpKey, (damageByRoundPlayer.get(rpKey) ?? 0) + actualDmg);
  }

  // 6. Bomb events
  // `site` is the bombsite trigger's entity index (e.g. 184), not a letter.
  // The planter's/defuser's place name ("BombsiteA") gives the letter per index.
  const bombFields = ["X", "Y", "Z", "last_place_name"];
  const bombPlanted = parser.parseEvent(filePath, "bomb_planted", bombFields) as Record<string, unknown>[];
  const bombDefused = parser.parseEvent(filePath, "bomb_defused", bombFields) as Record<string, unknown>[];
  const bombExploded = parser.parseEvent(filePath, "bomb_exploded", bombFields) as Record<string, unknown>[];

  const siteByEntity = new Map<string, "A" | "B">();
  for (const b of [...(bombPlanted ?? []), ...(bombDefused ?? [])]) {
    const letter = bombSiteLetter(b.site, b.user_last_place_name);
    if (letter && b.site != null) siteByEntity.set(str(b.site), letter);
  }

  const bombEvents: ParsedBombEvent[] = [];

  function parseBombEvents(events: Record<string, unknown>[] | null, type: string) {
    for (const b of events ?? []) {
      const tick = num(b.tick);
      if (!inMatch(tick)) continue;
      const roundNumber = findRoundNumber(tick);
      const site =
        bombSiteLetter(b.site, type === "EXPLODED" ? undefined : b.user_last_place_name) ??
        (b.site != null ? siteByEntity.get(str(b.site)) : undefined) ??
        bombEvents.find((e) => e.roundNumber === roundNumber && e.site)?.site;
      bombEvents.push({
        tick,
        roundNumber,
        type,
        playerSteamId: str(b.user_steamid),
        pos: { x: num(b.user_X), y: num(b.user_Y), z: num(b.user_Z) },
        site,
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

  // Pre-parse flash blind events for flash effectiveness. Grenade entity
  // indices are recycled during a match, so a blind belongs to the flash with
  // the same entityid that detonated on (about) the same tick.
  const blindEvents = parser.parseEvent(filePath, "player_blind") as Record<string, unknown>[] | null;
  const blindByEntity = new Map<number, Array<{ tick: number; victimId: string; duration: number }>>();
  for (const b of blindEvents ?? []) {
    const tick = num(b.tick);
    if (!inMatch(tick)) continue;
    const eid = num(b.entityid);
    const victimId = str(b.user_steamid);
    const attackerId = str(b.attacker_steamid);
    if (!victimId || !attackerId) continue;
    // Skip team flashes: only count enemies
    if (sameTeam(attackerId, victimId)) continue;
    const arr = blindByEntity.get(eid);
    const entry = { tick, victimId, duration: num(b.blind_duration) };
    if (arr) arr.push(entry);
    else blindByEntity.set(eid, [entry]);
  }

  // Fire end per molotov: inferno_expire with the same entityid
  const infernoExpireByEntity = new Map<number, number[]>();
  try {
    const expires = (parser.parseEvent(filePath, "inferno_expire") as Record<string, unknown>[] | null) ?? [];
    for (const e of expires) {
      const eid = num(e.entityid);
      const arr = infernoExpireByEntity.get(eid);
      if (arr) arr.push(num(e.tick));
      else infernoExpireByEntity.set(eid, [num(e.tick)]);
    }
    for (const arr of infernoExpireByEntity.values()) arr.sort((a, b) => a - b);
  } catch {
    // optional — falls back to a fixed burn time
  }
  const grenadeWindows: GrenadeWindow[] = [];

  for (const { event, type } of grenadeEventMap) {
    const events = parser.parseEvent(filePath, event, ["X", "Y", "Z"]) as Record<string, unknown>[] | null;
    for (const e of events ?? []) {
      const tick = num(e.tick);
      if (!inMatch(tick)) continue;

      const throwerSteamId = str(e.user_steamid);
      if (!throwerSteamId) continue;

      const entityId = num(e.entityid);

      // Flash: count enemies blinded from player_blind
      let playersFlashed = 0;
      let totalBlindDuration = 0;
      if (type === "FLASH") {
        const blinds = (blindByEntity.get(entityId) ?? []).filter(
          (b) => Math.abs(b.tick - tick) <= FLASH_BLIND_TICK_SLACK
        );
        playersFlashed = blinds.length;
        totalBlindDuration = blinds.reduce((sum, b) => sum + b.duration, 0);
      }

      if (type === "HE" || type === "MOLOTOV") {
        let endTick = tick + HE_DAMAGE_WINDOW_TICKS;
        if (type === "MOLOTOV") {
          const expire = infernoExpireByEntity.get(entityId)?.find((t) => t >= tick);
          // Capped at the max burn time: entity indices are recycled, so a
          // missing inferno_expire must not pull in a later fire's expire.
          const maxEnd = tick + Math.round(header.tickRate * MOLOTOV_FALLBACK_BURN_S);
          endTick = expire !== undefined ? Math.min(expire, maxEnd) : maxEnd;
        }
        grenadeWindows.push({ index: grenades.length, kind: type, throwerSteamId, startTick: tick, endTick });
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
        damageDealt: 0,
        playersFlashed,
      });
    }
  }

  // HE / molotov damage: the thrower's credited damage inside each grenade's window
  const grenadeDamage = assignGrenadeDamage(grenadeWindows, grenadeHits);
  for (const [index, dmg] of grenadeDamage) grenades[index].damageDealt = dmg;

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

  // Count kills and deaths from kill events. Suicides, world deaths and team
  // kills count as the victim's death but never as a kill.
  for (const k of kills) {
    const attacker = playerStats.get(k.attackerSteamId);
    const victim = playerStats.get(k.victimSteamId);

    if (attacker && !isNonEnemyKill(k)) {
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
  const clutchStatsByPlayer = computeClutchStats({
    rounds,
    kills,
    playerRoster,
    teamASideByRound,
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
      clutchWins: clutchStatsByPlayer.get(p.steamId)?.wins ?? 0,
      clutchAttempts: clutchStatsByPlayer.get(p.steamId)?.attempts ?? 0,
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

// ─── Pure helpers (exported for the no-demo regression tests) ─────────

/** Blinds are matched to a flash detonating within this many ticks. */
const FLASH_BLIND_TICK_SLACK = 2;
/** HE damage lands on (or right after) the detonate tick. */
const HE_DAMAGE_WINDOW_TICKS = 8;
/** Max burn time; also used when a molotov has no inferno_expire (≈7 s in CS2). */
const MOLOTOV_FALLBACK_BURN_S = 7.5;

export interface GrenadeHit {
  attackerSteamId: string;
  tick: number;
  kind: "HE" | "MOLOTOV";
  /** Credited damage (HP-capped, enemies only). */
  damage: number;
}

export interface GrenadeWindow {
  /** Caller's index of the grenade. */
  index: number;
  kind: "HE" | "MOLOTOV";
  throwerSteamId: string;
  /** Detonate / inferno_startburn tick. */
  startTick: number;
  /** Last tick its damage can land on (inferno_expire for a molotov). */
  endTick: number;
}

/**
 * Damage per grenade: each hit goes to the thrower's grenade of the same kind
 * whose window covers the hit tick (the latest-started one if several do), so
 * a molotov collects its whole burn and no hit is counted twice.
 */
export function assignGrenadeDamage(
  windows: GrenadeWindow[],
  hits: GrenadeHit[]
): Map<number, number> {
  const byThrower = new Map<string, GrenadeWindow[]>();
  for (const w of windows) {
    const key = `${w.throwerSteamId}|${w.kind}`;
    const arr = byThrower.get(key);
    if (arr) arr.push(w);
    else byThrower.set(key, [w]);
  }
  for (const arr of byThrower.values()) arr.sort((a, b) => a.startTick - b.startTick);

  const out = new Map<number, number>();
  for (const w of windows) out.set(w.index, 0);
  for (const h of hits) {
    const arr = byThrower.get(`${h.attackerSteamId}|${h.kind}`);
    if (!arr) continue;
    let match: GrenadeWindow | undefined;
    for (const w of arr) {
      if (w.startTick > h.tick) break;
      if (h.tick <= w.endTick) match = w;
    }
    if (match) out.set(match.index, (out.get(match.index) ?? 0) + h.damage);
  }
  return out;
}

/**
 * Bombsite letter from a bomb event's `site` (a letter on some sources, the
 * trigger's entity index on CS2) or the player's place name ("BombsiteA").
 */
export function bombSiteLetter(site: unknown, placeName: unknown): "A" | "B" | undefined {
  if (site === "A" || site === "B") return site;
  if (typeof placeName === "string") {
    const m = /bombsite\s*_?([AB])\b/i.exec(placeName);
    if (m) return m[1].toUpperCase() as "A" | "B";
  }
  return undefined;
}

export interface TeamASidesInput {
  roundNumbers: number[];
  /** Round → steamId → live team_num (2 = T, 3 = CT) sampled in that round. */
  liveTeamsByRound: Map<number, Map<string, number>>;
  /** steamId → side at END of match (teamA = finished on CT). */
  playerRoster: Map<string, { team: Side }>;
}

/**
 * teamA's (finished-on-CT team's) side in every round, by majority of the live
 * team_num samples. Rounds without samples use the MR12/MR3 rule counted back
 * from the last round, which also covers matches that end before halftime.
 */
export function resolveTeamASides({
  roundNumbers,
  liveTeamsByRound,
  playerRoster,
}: TeamASidesInput): Map<number, Side> {
  const lastRound = roundNumbers.reduce((m, n) => Math.max(m, n), 0);
  const out = new Map<number, Side>();
  for (const n of roundNumbers) {
    let ct = 0;
    let t = 0;
    for (const [steamId, teamNum] of liveTeamsByRound.get(n) ?? []) {
      const finalSide = playerRoster.get(steamId)?.team;
      if (!finalSide || (teamNum !== 2 && teamNum !== 3)) continue;
      const live: Side = teamNum === 3 ? "CT" : "T";
      // A teamB player on side X means teamA is on the other side.
      const teamASide = finalSide === "CT" ? live : otherSide(live);
      if (teamASide === "CT") ct++;
      else t++;
    }
    out.set(n, ct === t ? ruleSideAtRound("CT", n, lastRound) : ct > t ? "CT" : "T");
  }
  return out;
}

/**
 * Credit every round to the team that played the winning side and fill the
 * cumulative ctScore (teamA) / tScore (teamB).
 */
export function scoreRounds(
  rounds: Pick<ParsedRound, "number" | "winner" | "ctScore" | "tScore">[],
  teamASideByRound: Map<number, Side>
): { teamA: number; teamB: number } {
  const lastRound = rounds.reduce((m, r) => Math.max(m, r.number), 0);
  let teamA = 0;
  let teamB = 0;
  for (const r of [...rounds].sort((a, b) => a.number - b.number)) {
    const teamASide = teamASideByRound.get(r.number) ?? ruleSideAtRound("CT", r.number, lastRound);
    if (r.winner === teamASide) teamA++;
    else teamB++;
    r.ctScore = teamA;
    r.tScore = teamB;
  }
  return { teamA, teamB };
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
  rounds: Pick<ParsedRound, "number" | "winner">[];
  kills: Pick<ParsedKill, "tick" | "roundNumber" | "attackerSteamId" | "victimSteamId">[];
  /** steamId → side at END of match (as reported by parsePlayerInfo). */
  playerRoster: Map<string, { team: "CT" | "T" }>;
  /**
   * Side of teamA (the players who finished on CT) in each round — from
   * `resolveTeamASides`. Rounds missing here use the MR12/MR3 rule.
   */
  teamASideByRound: Map<number, Side>;
}

export interface ClutchTally {
  wins: number;
  attempts: number;
}

/**
 * Count 1vX clutches (attempts and wins) per player.
 *
 * A round's `winner` is an absolute side, but `playerRoster` holds end-of-match
 * sides. Every round is therefore resolved against the side map that was
 * actually in play (per round, so overtime and short matches work) — using the
 * roster verbatim would invert the won/lost flag on every round played on the
 * other side.
 */
export function computeClutchStats({
  rounds,
  kills,
  playerRoster,
  teamASideByRound,
}: ClutchWinsInput): Map<string, ClutchTally> {
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

  const finalTeamBySteamId = new Map<string, Side>();
  for (const [steamId, info] of playerRoster) finalTeamBySteamId.set(steamId, info.team);
  const lastRound = rounds.reduce((m, r) => Math.max(m, r.number), 0);

  const clutches = detectClutchesBySide({
    rounds: rounds.map((r) => ({
      id: String(r.number),
      number: r.number,
      winner: r.winner,
      kills: killsByRound.get(r.number) ?? [],
    })),
    finalTeamBySteamId,
    sideAt: (finalSide, roundNumber) =>
      sideInRound(finalSide, roundNumber, teamASideByRound, lastRound),
  });

  const out = new Map<string, ClutchTally>();
  for (const c of clutches) {
    const tally = out.get(c.clutcherSteamId) ?? { wins: 0, attempts: 0 };
    tally.attempts++;
    if (c.won) tally.wins++;
    out.set(c.clutcherSteamId, tally);
  }
  return out;
}

/** Won 1vX clutches per player (see computeClutchStats). */
export function computeClutchWins(input: ClutchWinsInput): Map<string, number> {
  const wins = new Map<string, number>();
  for (const [steamId, tally] of computeClutchStats(input)) {
    if (tally.wins > 0) wins.set(steamId, tally.wins);
  }
  return wins;
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
