/**
 * Regression test for the S28 performance plumbing. Run: npm run test:perf
 *
 * 1. prefetchingParser() — every parseEvent served from a one-pass read gets
 *    exactly the rows a separate parseEvent call returns (extras the caller
 *    didn't ask for stripped, event_name and non-player keys kept), counts
 *    passes, and falls back to separate calls on another file or a failed pass.
 * 2. rowsFromColumns() — structOfArrays columns rebuild the same rows.
 * 3. parseProcessCount() — PARSE_WORKERS and the machine-size default.
 * 4. decodeRoundTicksCached() — one decode per blob inside the scope, equal
 *    frames to a plain decode, no cache outside it.
 *
 * No demo file or database required.
 */
import type { DemoParser } from "@/lib/parsers/load-parser";
import { rowsFromColumns } from "@/lib/parsers/load-parser";
import { PREFETCH_PASSES, prefetchingParser, stripExtras } from "@/lib/parsers/event-prefetch";
import { parseProcessCount } from "@/lib/parsers/parse-processes";
import { decodeRoundTicksCached, withDecodeCache } from "@/lib/replay/decode-cache";
import { decodeRoundTicks, encodeRoundTicks } from "@/lib/replay/round-ticks";

const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. event prefetch ──────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const ROLES = ["user_", "attacker_", "assister_"];
/** A fake demo: a few events, each with player roles and every possible extra. */
function fakeRows(eventName: string, extras: string[]): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < 3; i++) {
    const row: Row = { event_name: eventName, tick: 100 * i + eventName.length, weapon: "ak47", user_name: `p${i}` };
    if (eventName === "player_death") row.attacker_name = `k${i}`;
    for (const role of eventName === "player_death" ? ROLES : ["user_"]) {
      for (const e of extras) row[role + e] = `${role}${e}${i}`;
    }
    out.push(row);
  }
  return out;
}
let passes = 0;
let singles = 0;
let failEvents = false;
const base: DemoParser = {
  parseHeader: () => ({}),
  parsePlayerInfo: () => [],
  parseTicks: () => [],
  parseEvent(_p, name, extra) {
    singles++;
    return fakeRows(name, extra ?? []);
  },
  parseEvents(_p, names, extra) {
    passes++;
    if (failEvents) throw new Error("unknown prop");
    return names.flatMap((n) => fakeRows(n, extra ?? []));
  },
};

const FILE = "/demos/a.dem";
const pre = prefetchingParser(base, FILE);
const asks: [string, string[] | undefined][] = [
  ["round_end", undefined],
  ["player_death", ["X", "Y", "Z", "last_place_name"]],
  ["player_death", ["inventory"]],
  ["weapon_fire", ["X", "Y", "Z", "pitch", "yaw", "velocity_X", "velocity_Y", "velocity_Z", "active_weapon_ammo"]],
  ["player_hurt", []],
  ["smokegrenade_detonate", ["X", "Y"]],
];
let allSame = true;
for (const [name, extra] of asks) {
  const got = pre.parseEvent(FILE, name, extra);
  const want = fakeRows(name, extra ?? []);
  if (!same(got, want)) {
    allSame = false;
    console.log("  mismatch", name, extra, JSON.stringify(got).slice(0, 200));
  }
}
check("prefetched parseEvent equals a separate call for every ask", allSame);
check("two passes for the whole pipeline, no single calls", passes === PREFETCH_PASSES.length && singles === 0);

singles = 0;
pre.parseEvent("/demos/other.dem", "round_end");
pre.parseEvent(FILE, "item_pickup");
pre.parseEvent(FILE, "player_death", ["health"]);
check("another file, an unlisted event or an unlisted extra go straight to the parser", singles === 3);

passes = 0;
singles = 0;
failEvents = true;
const failing = prefetchingParser(base, FILE);
const origWarn = console.warn;
console.warn = () => {};
const r1 = failing.parseEvent(FILE, "round_end");
failing.parseEvent(FILE, "bomb_planted");
console.warn = origWarn;
failEvents = false;
check("a failed pass falls back to separate calls, tried once", same(r1, fakeRows("round_end", [])) && passes === 1 && singles === 2);

check(
  "stripExtras keeps non-player keys that share an extra's name",
  same(stripExtras({ X: 1, user_X: 2, user_Y: 3, tick: 4 }, ["X", "Y"], new Set(["Y"])), { X: 1, user_Y: 3, tick: 4 })
);

// ── 2. struct-of-arrays rows ───────────────────────────────────────────────
const cols = { tick: [1, 1, 2], steamid: ["a", "b", "a"], X: [0.5, -1, 2] };
check(
  "rowsFromColumns rebuilds one row per player per tick",
  same(rowsFromColumns(cols), [
    { tick: 1, steamid: "a", X: 0.5 },
    { tick: 1, steamid: "b", X: -1 },
    { tick: 2, steamid: "a", X: 2 },
  ])
);
check("rowsFromColumns of no columns is empty", rowsFromColumns({}).length === 0);

// ── 3. parse processes ─────────────────────────────────────────────────────
const GB = 1024 ** 3;
check("default: small machine gets 1 process", parseProcessCount(undefined, 2, 8 * GB) === 1);
check("default: 4 cores + 16 GB gets 2", parseProcessCount(undefined, 4, 16 * GB) === 2);
check("default: 8 cores but 8 GB gets 1", parseProcessCount(undefined, 8, 8 * GB) === 1);
check("PARSE_WORKERS=3 is honoured", parseProcessCount("3", 8, 4 * GB) === 3);
check("PARSE_WORKERS is capped at the core count", parseProcessCount("16", 4, 64 * GB) === 4);
check("garbage PARSE_WORKERS falls back to the default", parseProcessCount("abc", 2, 4 * GB) === 1 && parseProcessCount("0", 2, 4 * GB) === 1);

// ── 4. decode cache ────────────────────────────────────────────────────────
const tickRows = [1000, 1004, 1008].flatMap((tick) =>
  ["1", "2"].map((steamid, i) => ({
    tick,
    steamid,
    name: `p${steamid}`,
    X: tick - 1000 + i,
    Y: -5,
    Z: 1,
    pitch: 0,
    yaw: 45,
    health: 100,
    armor_value: 100,
    is_alive: true,
    team_num: i ? 3 : 2,
    active_weapon_name: "AK-47",
    flash_duration: 0,
  }))
);
const rec = encodeRoundTicks(tickRows, 1000, 1008, 4);
let first: unknown;
let second: unknown;
const plain = decodeRoundTicks(rec);
void withDecodeCache(async () => {
  first = decodeRoundTicksCached(rec);
  second = decodeRoundTicksCached(rec);
}).then(() => {
  check("cached decode equals a plain decode", same(first, plain));
  check("a blob decodes once inside the scope", first === second);
  check("outside the scope every call decodes", decodeRoundTicksCached(rec) !== decodeRoundTicksCached(rec));

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
});
