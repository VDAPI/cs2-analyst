/**
 * WpMatch JSON files (ml/esta/to_wp.py) → training snapshot sets, with the app's
 * own feature code, for fitting the shipped prior (ml/fit_prior_esta.py).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/esta-snapshots.ts <WpMatch dir> <out dir> [shard] [shards]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { matchSnapshots, WP_FEATURES, WP_FEATURES_VERSION, type WpMatch } from "@/lib/winprob/features";

const [src, out, shard = "0", shards = "1"] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: esta-snapshots.ts <WpMatch dir> <out dir> [shard] [shards]");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const files = readdirSync(src)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .filter((_, i) => i % Number(shards) === Number(shard));
for (const f of files) {
  const dst = path.join(out, f);
  if (existsSync(dst)) continue;
  const match = JSON.parse(readFileSync(path.join(src, f), "utf8")) as WpMatch & { id: string; map: string };
  const rows = matchSnapshots(match).map((s) => [
    s.roundNumber,
    s.tick,
    s.tWin,
    ...s.features.map((v) => (Number.isFinite(v) ? v : null)),
  ]);
  writeFileSync(dst, JSON.stringify({ matchId: match.id, map: match.map, version: WP_FEATURES_VERSION, features: WP_FEATURES, rows }));
}
console.log(`shard ${shard}: ${files.length} matches`);
