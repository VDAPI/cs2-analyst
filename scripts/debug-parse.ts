/**
 * Debug script to inspect raw demoparser2 output.
 * Usage: npx tsx scripts/debug-parse.ts <path-to-dem-file>
 */

import {
  parseHeader,
  parseEvent,
  parsePlayerInfo,
  listGameEvents,
} from "@laihoe/demoparser2";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/debug-parse.ts <path-to-dem-file>");
  process.exit(1);
}

console.log("=== FILE ===");
console.log(filePath);
console.log();

console.log("=== HEADER ===");
const header = parseHeader(filePath);
console.log(JSON.stringify(header, null, 2));
console.log();

console.log("=== PLAYER INFO ===");
const playerInfo = parsePlayerInfo(filePath);
console.log(JSON.stringify(playerInfo, null, 2));
console.log();

console.log("=== GAME EVENTS (available) ===");
const events = listGameEvents(filePath);
console.log(JSON.stringify(events, null, 2));
console.log();

console.log("=== ROUND_START (count + first 3) ===");
const roundStarts = parseEvent(filePath, "round_start");
console.log(`Total: ${roundStarts?.length ?? 0}`);
console.log(JSON.stringify(roundStarts?.slice(0, 3), null, 2));
console.log();

console.log("=== ROUND_END (ALL) ===");
const roundEnds = parseEvent(filePath, "round_end");
console.log(`Total: ${roundEnds?.length ?? 0}`);
console.log(JSON.stringify(roundEnds, null, 2));
console.log();

console.log("=== PLAYER_DEATH (first 5) ===");
const deaths = parseEvent(filePath, "player_death", ["X", "Y", "Z", "team_name"]);
console.log(`Total: ${deaths?.length ?? 0}`);
console.log(JSON.stringify(deaths?.slice(0, 5), null, 2));
console.log();

console.log("=== PLAYER_HURT (first 5 + field names) ===");
const hurts = parseEvent(filePath, "player_hurt");
console.log(`Total: ${hurts?.length ?? 0}`);
if (hurts?.[0]) {
  console.log("Keys:", Object.keys(hurts[0]));
}
console.log(JSON.stringify(hurts?.slice(0, 5), null, 2));
console.log();

console.log("=== ROUND_END field names ===");
if (roundEnds?.[0]) {
  console.log("Keys:", Object.keys(roundEnds[0]));
}

console.log("=== PLAYER_DEATH field names ===");
if (deaths?.[0]) {
  console.log("Keys:", Object.keys(deaths[0]));
}
