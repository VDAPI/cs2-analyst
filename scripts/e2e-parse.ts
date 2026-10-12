/**
 * End-to-end parser check on a real demo.
 * Run: npm run test:e2e-demo -- <path/to/match.dem>
 *
 * Not in CI (no demo in the repo). Parses the demo with parseDemoFile and
 * checks the result against the demo's own raw data:
 *  - final score = the game's team_rounds_total per team,
 *  - every round's CT/T equipment = the live team_num sides at freeze end,
 *  - deaths: one per death row, nobody dies more than once a round,
 *  - molotov damage is credited when fire hurt enemies,
 *  - bomb sites are A/B, duration and totalTicks are set.
 */
import { parseDemoFile } from "@/lib/parsers/demo-parser";

const file = process.argv[2];
if (!file) {
  console.error("usage: npm run test:e2e-demo -- <path.dem>");
  process.exit(2);
}

const checks: [string, boolean, string][] = [];
const check = (label: string, ok: boolean, detail = "") => checks.push([label, ok, detail]);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

(async () => {
  const dp = await import("@laihoe/demoparser2");
  const d = await parseDemoFile(file);
  const lastRound = d.rounds[d.rounds.length - 1];
  check("has rounds", d.rounds.length > 0, `${d.rounds.length}`);
  if (!lastRound) return;

  // ── Score vs team_rounds_total ──
  const finalTeam = new Map(d.players.map((p) => [p.steamId, p.team]));
  const endTicks = (dp.parseEvent(file, "cs_win_panel_match") as Record<string, unknown>[] | null ?? [])
    .map((e) => num(e.tick))
    .filter((t) => t >= lastRound.endTick);
  const scoreTick = endTicks[0] ?? lastRound.endTick + 32;
  const teamRows = dp.parseTicks(file, ["team_num", "team_rounds_total"], [scoreTick]) as Record<string, unknown>[];
  let liveA: number | null = null;
  let liveB: number | null = null;
  for (const r of teamRows) {
    // A player who left the server reads null — use the teammates' value.
    if (r.team_rounds_total == null) continue;
    const side = finalTeam.get(String(r.steamid));
    const total = num(r.team_rounds_total);
    if (side === "CT") liveA = Math.max(liveA ?? 0, total);
    if (side === "T") liveB = Math.max(liveB ?? 0, total);
  }
  check(
    "score matches team_rounds_total",
    liveA === d.header.scoreCT && liveB === d.header.scoreT,
    `parsed ${d.header.scoreCT}:${d.header.scoreT}, game ${liveA}:${liveB}`
  );
  check(
    "cumulative round scores add up",
    d.rounds.every((r) => r.ctScore + r.tScore === r.number),
    ""
  );
  check(
    "winners are CT/T",
    d.rounds.every((r) => r.winner === "CT" || r.winner === "T"),
    [...new Set(d.rounds.map((r) => `${r.winner}/${r.winReason}`))].join(",")
  );

  // ── Economy sides vs live team_num at freeze end ──
  const freezeTicks = (dp.parseEvent(file, "round_freeze_end") as Record<string, unknown>[] | null ?? []).map((e) =>
    num(e.tick)
  );
  const econMismatch: string[] = [];
  for (const r of d.rounds) {
    const ft = freezeTicks.find((t) => t >= r.startTick && t < r.endTick);
    if (ft === undefined) continue;
    const rows = dp.parseTicks(file, ["team_num", "current_equip_value"], [ft]) as Record<string, unknown>[];
    let ct = 0;
    let t = 0;
    for (const row of rows) {
      if (num(row.team_num) === 3) ct += num(row.current_equip_value);
      else if (num(row.team_num) === 2) t += num(row.current_equip_value);
    }
    if (ct !== r.ctEquipValue || t !== r.tEquipValue) {
      econMismatch.push(`R${r.number} parsed ${r.ctEquipValue}/${r.tEquipValue} live ${ct}/${t}`);
    }
  }
  check("economy CT/T = live sides", econMismatch.length === 0, econMismatch.join("; "));

  // ── Deaths ──
  const deaths = d.players.reduce((s, p) => s + p.deaths, 0);
  const kills = d.players.reduce((s, p) => s + p.kills, 0);
  const rosterDeathRows = d.kills.filter((k) => finalTeam.has(k.victimSteamId)).length;
  check("deaths = death rows", deaths === rosterDeathRows, `${deaths} vs ${rosterDeathRows}`);
  check("kills <= deaths", kills <= deaths, `${kills} kills, ${deaths} deaths`);
  const perRound = new Map<string, number>();
  for (const k of d.kills) {
    const key = `${k.roundNumber}|${k.victimSteamId}`;
    perRound.set(key, (perRound.get(key) ?? 0) + 1);
  }
  check(
    "nobody dies twice in a round",
    [...perRound.values()].every((n) => n <= 1),
    [...perRound.entries()].filter(([, n]) => n > 1).map(([k]) => k).join(",")
  );
  check(
    "no deaths after the last round",
    d.kills.every((k) => k.tick <= scoreTick),
    ""
  );

  // ── Molotov damage ──
  const hurts = (dp.parseEvent(file, "player_hurt") as Record<string, unknown>[] | null) ?? [];
  const enemyFire = hurts.some((h) => {
    if (h.weapon !== "inferno" && h.weapon !== "molotov") return false;
    const a = finalTeam.get(String(h.attacker_steamid ?? ""));
    const v = finalTeam.get(String(h.user_steamid ?? ""));
    return a !== undefined && v !== undefined && a !== v && num(h.tick) >= d.rounds[0].startTick && num(h.tick) <= scoreTick;
  });
  const moloDmg = d.grenades.filter((g) => g.type === "MOLOTOV").reduce((s, g) => s + g.damageDealt, 0);
  check("molotov damage credited", !enemyFire || moloDmg > 0, `${moloDmg}`);

  // ── Bomb sites ──
  const plants = d.bombEvents.filter((b) => b.type === "PLANTED");
  check(
    "bomb sites are A/B",
    plants.every((b) => b.site === "A" || b.site === "B"),
    [...new Set(d.bombEvents.map((b) => String(b.site)))].join(",")
  );

  // ── Header ──
  check("duration > 0", d.header.duration > 0, `${d.header.duration}s`);
  check("totalTicks > 0", d.header.totalTicks > 0, `${d.header.totalTicks}`);
})()
  .catch((err) => {
    check("parse ran", false, String(err));
  })
  .finally(() => {
    let failed = 0;
    for (const [label, ok, detail] of checks) {
      console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
      if (!ok) failed++;
    }
    console.log(`\n${checks.length - failed}/${checks.length} passed`);
    process.exit(failed > 0 ? 1 : 0);
  });
