import { parseDemoFile } from "../src/lib/parsers/demo-parser";

const file = process.argv[2] || "data/demos/cmnpzo7qw0001d93olqxooafo.dem";

async function main() {
  console.log("Parsing:", file);
  const result = await parseDemoFile(file);

  console.log(`\nGrenades extracted: ${result.grenades.length}`);

  // Count by type
  const byType = new Map<string, number>();
  for (const g of result.grenades) {
    byType.set(g.type, (byType.get(g.type) ?? 0) + 1);
  }
  console.log("\nBy type:");
  for (const [type, count] of byType) {
    console.log(`  ${type}: ${count}`);
  }

  // Show first few of each type
  for (const type of ["SMOKE", "FLASH", "HE", "MOLOTOV"]) {
    const items = result.grenades.filter((g) => g.type === type);
    console.log(`\n=== ${type} (first 3) ===`);
    for (const g of items.slice(0, 3)) {
      console.log(
        `  R${g.roundNumber} ${g.throwerName}: ` +
          `throw(${g.throwPos.x.toFixed(0)},${g.throwPos.y.toFixed(0)}) → ` +
          `land(${g.landPos.x.toFixed(0)},${g.landPos.y.toFixed(0)})` +
          (g.damageDealt > 0 ? ` dmg=${g.damageDealt}` : "") +
          (g.playersFlashed > 0 ? ` flashed=${g.playersFlashed}` : "") +
          (g.duration ? ` dur=${g.duration}ms` : "")
      );
    }
  }

  // Per-player utility stats
  console.log("\n=== Per-player utility stats ===");
  const playerStats = new Map<string, { name: string; smokes: number; flashes: number; hes: number; molotovs: number; flashEnemies: number; utilDmg: number }>();
  for (const g of result.grenades) {
    if (!playerStats.has(g.throwerSteamId)) {
      playerStats.set(g.throwerSteamId, { name: g.throwerName, smokes: 0, flashes: 0, hes: 0, molotovs: 0, flashEnemies: 0, utilDmg: 0 });
    }
    const s = playerStats.get(g.throwerSteamId)!;
    if (g.type === "SMOKE") s.smokes++;
    else if (g.type === "FLASH") { s.flashes++; s.flashEnemies += g.playersFlashed; }
    else if (g.type === "HE") { s.hes++; s.utilDmg += g.damageDealt; }
    else if (g.type === "MOLOTOV") { s.molotovs++; s.utilDmg += g.damageDealt; }
  }
  for (const [, s] of playerStats) {
    console.log(`  ${s.name}: S${s.smokes} F${s.flashes} HE${s.hes} M${s.molotovs} | flash_enemies=${s.flashEnemies} util_dmg=${s.utilDmg}`);
  }
}

main().catch(console.error);
