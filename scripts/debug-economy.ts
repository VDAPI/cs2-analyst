import { parseEvent, parseTicks } from "@laihoe/demoparser2";

const file = "data/demos/cmnpsxg8m0001d9v81jiqjepb.dem";

// Check round_freeze_end for economy snapshots
console.log("=== round_freeze_end (first 3) ===");
const freezeEnds = parseEvent(file, "round_freeze_end");
console.log("Count:", freezeEnds?.length ?? 0);
if (freezeEnds?.[0]) console.log("Keys:", Object.keys(freezeEnds[0]));
console.log(JSON.stringify(freezeEnds?.slice(0, 3), null, 2));

// Try getting money/equipment from tick data at freeze time
if (freezeEnds && freezeEnds.length > 2) {
  const tick = Number(freezeEnds[2].tick); // third round freeze end
  console.log("\n=== Tick data at freeze_end tick", tick, "===");
  const tickData = parseTicks(
    file,
    ["team_num", "current_equip_value", "cash_spent_this_round", "total_cash_spent", "balance"],
    [tick]
  );
  console.log("Count:", tickData.length);
  if (tickData.length > 0) {
    console.log("Keys:", Object.keys(tickData[0]));
    console.log(JSON.stringify(tickData.slice(0, 3), null, 2));
  }
}
