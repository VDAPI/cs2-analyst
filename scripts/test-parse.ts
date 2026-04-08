/**
 * Test script to verify parser output after fixes.
 * Usage: npx tsx scripts/test-parse.ts <path-to-dem-file>
 */

import { parseDemoFile } from "../src/lib/parsers/demo-parser";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/test-parse.ts <path-to-dem-file>");
  process.exit(1);
}

async function main() {
  console.log("Parsing:", filePath);
  const result = await parseDemoFile(filePath);

  console.log("\n=== HEADER ===");
  console.log(`Map: ${result.header.map}`);
  console.log(`Score: CT ${result.header.scoreCT} - ${result.header.scoreT} T`);
  console.log(`Rounds: ${result.rounds.length}`);
  console.log(`Duration: ${result.header.duration}s`);
  console.log(`Server: ${result.header.server}`);

  console.log("\n=== ROUNDS ===");
  for (const r of result.rounds) {
    console.log(`  R${r.number}: ${r.winner} (${r.winReason}) [${r.ctScore}-${r.tScore}]`);
  }

  console.log("\n=== PLAYERS ===");
  const ct = result.players.filter((p) => p.team === "CT");
  const t = result.players.filter((p) => p.team === "T");

  console.log(`\nCT (${ct.length} players):`);
  console.log("  Name                K   D   A   ADR   HLTV  HS%");
  for (const p of ct) {
    console.log(
      `  ${p.name.padEnd(18)} ${String(p.kills).padStart(3)} ${String(p.deaths).padStart(3)} ${String(p.assists).padStart(3)}   ${p.adr.toFixed(1).padStart(5)}  ${p.hltvRating.toFixed(2).padStart(5)}  ${p.hsPercent.toFixed(0).padStart(3)}%`
    );
  }

  console.log(`\nT (${t.length} players):`);
  console.log("  Name                K   D   A   ADR   HLTV  HS%");
  for (const p of t) {
    console.log(
      `  ${p.name.padEnd(18)} ${String(p.kills).padStart(3)} ${String(p.deaths).padStart(3)} ${String(p.assists).padStart(3)}   ${p.adr.toFixed(1).padStart(5)}  ${p.hltvRating.toFixed(2).padStart(5)}  ${p.hsPercent.toFixed(0).padStart(3)}%`
    );
  }

  console.log(`\n=== KILLS: ${result.kills.length} total ===`);
  console.log(`=== BOMB EVENTS: ${result.bombEvents.length} total ===`);
}

main().catch(console.error);
