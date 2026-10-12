/**
 * Regression test for S7: demo storage, deletion rule, plan limits, FACEIT
 * history filters. Run: npm run test:library
 *
 * 1. signS3Request() reproduces the AWS SigV4 documentation example
 *    ("GET Object" with a Range header), so R2 requests are signed right.
 * 2. shouldDeleteDemo() — a .dem is never deleted before its replay data is
 *    stored, never when the player chose "keep demo", never with
 *    DEMO_RETENTION=keep.
 * 3. parseDemoLocation() / deleteStoredDemo() for local and R2 fileUrls.
 * 4. allowedBatch(), filterHistory(), userResult(), demoState().
 *
 * No database, demo file or network needed.
 */
import { mkdtemp, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getR2Config, objectTarget, signS3Request } from "@/lib/storage/r2";
import { deleteStoredDemo, parseDemoLocation, shouldDeleteDemo } from "@/lib/storage/demo-store";
import { allowedBatch, PLAN_LIMITS } from "@/lib/limits";
import { filterHistory, historyMaps } from "@/lib/faceit/filters";
import { userResult } from "@/lib/faceit/sync";
import { demoState, queueStage } from "@/lib/library";
import type { FaceitMatchDetail } from "@/lib/faceit/types";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

async function main() {
  // ─── 1. SigV4 against the AWS docs example ─────────────
  const headers = signS3Request({
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/test.txt",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    headers: { range: "bytes=0-9" },
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    date: new Date("2013-05-24T00:00:00Z"),
  });
  check(
    "SigV4 signature matches the AWS documentation example",
    headers.authorization ===
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
  );
  check("SigV4 sets x-amz-date", headers["x-amz-date"] === "20130524T000000Z");
  check("SigV4 leaves Host to fetch", !("host" in headers));

  // S20: the same client talks to MinIO (or any S3-compatible store) via R2_ENDPOINT.
  const creds = { R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "demos-bucket" };
  const r2Cfg = getR2Config({ ...creds, R2_ACCOUNT_ID: "acc" });
  check(
    "R2 account id → Cloudflare endpoint, region auto",
    r2Cfg?.endpoint === "https://acc.r2.cloudflarestorage.com" && r2Cfg.region === "auto"
  );
  const minio = getR2Config({ ...creds, R2_ENDPOINT: "http://minio:9000/", R2_REGION: "us-east-1" });
  check("R2_ENDPOINT works without an account id", minio?.endpoint === "http://minio:9000" && minio.region === "us-east-1");
  const minioTarget = minio && objectTarget(minio, "demos/a b.dem");
  check(
    "custom endpoint: path-style URL, port kept in the signed host",
    minioTarget?.url === "http://minio:9000/demos-bucket/demos/a%20b.dem" && minioTarget.host === "minio:9000"
  );
  check(
    "R2 target unchanged",
    r2Cfg !== null && objectTarget(r2Cfg, "demos/x.dem").url === "https://acc.r2.cloudflarestorage.com/demos-bucket/demos/x.dem"
  );
  check("no store without credentials", getR2Config({ R2_ENDPOINT: "http://minio:9000" }) === null);

  // ─── 2. Deletion rule ──────────────────────────────────
  check(
    "demo deleted after analysis by default",
    shouldDeleteDemo({ replayStored: true, keepDemo: false, retention: "delete" })
  );
  check(
    "demo kept when replay data failed to store",
    !shouldDeleteDemo({ replayStored: false, keepDemo: false, retention: "delete" })
  );
  check(
    "demo kept with \"keep demo\"",
    !shouldDeleteDemo({ replayStored: true, keepDemo: true, retention: "delete" })
  );
  check(
    "demo kept with DEMO_RETENTION=keep",
    !shouldDeleteDemo({ replayStored: true, keepDemo: false, retention: "keep" })
  );

  // ─── 3. Demo locations ─────────────────────────────────
  const r2 = parseDemoLocation("r2://demos/abc.dem");
  check("r2:// fileUrl parses to an R2 key", r2.kind === "r2" && r2.key === "demos/abc.dem");
  const win = parseDemoLocation("C:\\data\\demos\\abc.dem");
  check("Windows path gets forward slashes", win.kind === "local" && win.path === "C:/data/demos/abc.dem");
  check("empty fileUrl means no demo", parseDemoLocation("").kind === "none");

  const dir = await mkdtemp(join(tmpdir(), "cs2-library-test-"));
  const file = join(dir, "x.dem");
  await writeFile(file, "demo");
  await deleteStoredDemo(file);
  check("deleteStoredDemo removes a local file", !(await access(file).then(() => true, () => false)));
  let threw = false;
  await deleteStoredDemo(file).catch(() => (threw = true));
  check("deleting an already missing file is not an error", !threw);

  // ─── 4. Limits, filters, results ───────────────────────
  check("batch capped by what's left this month", allowedBatch(5, 3, 5) === 3);
  check("batch capped by plan batch size", allowedBatch(9, 100, 5) === 5);
  check("nothing left means nothing queued", allowedBatch(5, 0, 5) === 0);
  check("unlimited plan still capped by batch", allowedBatch(80, Infinity, 50) === 50);
  check("free plan picks 5 at once", PLAN_LIMITS.FREE.batchSize === 5);

  const now = new Date("2026-10-12T12:00:00Z");
  const history = [
    { id: "a", map: "de_mirage", date: "2026-10-11T12:00:00Z", result: "WIN" as const },
    { id: "b", map: "de_mirage", date: "2026-09-01T12:00:00Z", result: "LOSS" as const },
    { id: "c", map: "de_nuke", date: "2026-10-05T12:00:00Z", result: null },
  ];
  const ids = (f: Parameters<typeof filterHistory>[1]) =>
    filterHistory(history, f, now).map((m) => m.id).join(",");
  check("no filter keeps everything", ids({ map: "all", result: "all", period: "all" }) === "a,b,c");
  check("map filter", ids({ map: "de_mirage", result: "all", period: "all" }) === "a,b");
  check("result filter skips unknown results", ids({ map: "all", result: "LOSS", period: "all" }) === "b");
  check("period filter", ids({ map: "all", result: "all", period: "30" }) === "a,c");
  check("maps listed most played first", historyMaps(history).join(",") === "de_mirage,de_nuke");

  const details = {
    results: { winner: "faction2", score: { faction1: 9, faction2: 13 } },
    teams: {
      faction1: { roster: [{ player_id: "me" }] },
      faction2: { roster: [{ player_id: "them" }] },
    },
  } as unknown as FaceitMatchDetail;
  check("user on the losing faction gets LOSS", userResult(details, "me") === "LOSS");
  check("user on the winning faction gets WIN", userResult(details, "them") === "WIN");
  check("user missing from both rosters gets no result", userResult(details, "nobody") === null);

  check("deleted demo state", demoState({ demoDeletedAt: new Date(), keepDemo: true, status: "COMPLETED" }) === "deleted");
  check("kept demo state", demoState({ demoDeletedAt: null, keepDemo: true, status: "COMPLETED" }) === "kept");
  check("DOWNLOADING maps to the downloading stage", queueStage("DOWNLOADING") === "downloading");
}

main().then(() => {
  console.log();
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failed++;
  }
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
});
