import { parseDemoFile } from "../src/lib/parsers/demo-parser";

const file = process.argv[2] || "data/demos/cmnpsxg8m0001d9v81jiqjepb.dem";

async function main() {
  console.log("Parsing:", file);
  const result = await parseDemoFile(file);

  console.log(`\nScore: CT ${result.header.scoreCT} - ${result.header.scoreT} T`);
  console.log(`Rounds: ${result.rounds.length}`);

  console.log("\n=== Economy per round ===");
  for (const r of result.rounds) {
    console.log(
      `R${r.number.toString().padStart(2)}: ` +
      `CT $${r.ctEquipValue.toString().padStart(6)} equip, $${r.ctMoney.toString().padStart(6)} cash [${r.buyTypeCT.padEnd(9)}] | ` +
      `T $${r.tEquipValue.toString().padStart(6)} equip, $${r.tMoney.toString().padStart(6)} cash [${r.buyTypeT.padEnd(9)}] | ` +
      `Won by ${r.winner}`
    );
  }
}

main().catch(console.error);
