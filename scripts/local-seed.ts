/**
 * Local test environment seed (S20), run by `npm run setup:local` (and by the
 * `setup` service of docker-compose.yml on every `docker compose up`).
 *
 * Safe to run again: it never deletes anything and skips what is already
 * there.
 *  1. Creates the S3 bucket when demos go to a self-hosted store (the MinIO
 *     of docker-compose.yml, R2_ENDPOINT set).
 *  2. Creates the test account (LOCAL_USER, admin, high monthly limit) with
 *     three analysed sample matches. The matches are the E2E fixture demo
 *     (src/lib/parsers/fixture-demo.ts) run through the real pipeline, so the
 *     report, replay, mechanics and the rest work right after setup. The
 *     fixture parser is switched on for this process only; the app and the
 *     workers parse real demos with demoparser2.
 *  3. Downloads a real CS2 demo (de_mirage, 60 MB, demoparser2's test demo)
 *     to data/przyklad/ for testing the upload. SKIP_SAMPLE_DEMO=1 skips it.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { parseAndPersistDemo } from "../src/lib/parsers/persist-demo";
import { deleteUploadDemo } from "../src/lib/storage/demo-store";
import { getR2Config, r2EnsureBucket } from "../src/lib/storage/r2";
import { refreshNorms } from "../src/lib/norms/persist";
import { refreshPlanAfterAnalysis } from "../src/lib/coach/persist";
import { getDemoMatchId, setDemoMatchId } from "../src/lib/demo/demo-match";
import {
  DEFAULT_FIXTURE_ROUNDS,
  FIXTURE_PLAYER_STEAM_ID,
  fixtureDemoText,
  type FixtureOutcome,
} from "../src/lib/parsers/fixture-demo";

// Read by loadDemoParser() on its first call, which happens below.
process.env.E2E_FIXTURE_DEMOS = "1";

/** Shown in docs/TESTOWANIE.md. @cs2analyst.local can't be registered, so nobody else can take it. */
const LOCAL_USER = {
  email: "test@cs2analyst.local",
  password: "test1234",
  name: "Gracz testowy",
};

const SAMPLE_DEMO = {
  url: "https://raw.githubusercontent.com/LaihoE/demoparser/45ca85aeac8fb0de9d385124d2c7fe0e7b8ff0c8/src/parser/test_demo.dem",
  sha256: "84a1a4191302bdd2a3bbb5a727842093744b1fb1a228aeec630369e44b622cb2",
  path: join(process.cwd(), "data", "przyklad", "de_mirage-przyklad.dem"),
};

const LOSS_ROUNDS: FixtureOutcome[] = [
  "T:elim", "CT:elim", "CT:elim", "T:bomb", "CT:defuse", "CT:elim",
  "T:elim", "CT:time", "CT:elim", "T:elim", "CT:elim", "CT:elim",
  "CT:elim", "T:bomb", "CT:elim", "T:elim", "CT:elim",
];

const CLOSE_WIN_ROUNDS: FixtureOutcome[] = [
  "CT:elim", "T:elim", "T:bomb", "CT:elim", "T:elim", "CT:defuse", "T:elim",
  "CT:elim", "T:elim", "T:bomb", "CT:elim", "T:elim",
  "CT:elim", "T:elim", "CT:defuse", "CT:elim", "T:bomb", "CT:elim", "CT:elim", "CT:elim", "CT:elim",
];

const SAMPLES = [
  { seed: 1, rounds: DEFAULT_FIXTURE_ROUNDS, daysAgo: 1, fileName: "przyklad-mirage-wygrana.dem" },
  { seed: 3, rounds: LOSS_ROUNDS, daysAgo: 2, fileName: "przyklad-mirage-przegrana.dem" },
  { seed: 4, rounds: CLOSE_WIN_ROUNDS, daysAgo: 3, fileName: "przyklad-mirage-blisko.dem" },
];

const prisma = new PrismaClient();

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(20, 0, 0, 0);
  return d;
}

async function ensureBucket() {
  const cfg = getR2Config();
  if (!cfg || !process.env.R2_ENDPOINT) return;
  // MinIO may still be starting when compose runs this.
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await r2EnsureBucket(cfg);
      console.log(`setup: magazyn dem (${cfg.endpoint}, bucket "${cfg.bucket}"): ${result === "created" ? "utworzony" : "jest"}`);
      return;
    } catch (err) {
      if (attempt >= 10) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function analyseSample(userId: string, s: (typeof SAMPLES)[number]): Promise<string> {
  const date = daysAgo(s.daysAgo);
  const text = fixtureDemoText(s.seed, s.rounds);
  const upload = await prisma.demoUpload.create({
    data: {
      userId,
      fileName: s.fileName,
      fileSize: Buffer.byteLength(text),
      fileUrl: "",
      status: "QUEUED",
      createdAt: date,
    },
  });
  const filePath = join(tmpdir(), `cs2analyst-seed-${upload.id}.dem`);
  await writeFile(filePath, text);
  await prisma.demoUpload.update({ where: { id: upload.id }, data: { fileUrl: filePath } });
  try {
    const { matchId, replayStored } = await parseAndPersistDemo(prisma, { uploadId: upload.id, filePath });
    if (!replayStored) throw new Error(`replay data was not stored for ${s.fileName}`);
    await prisma.match.update({ where: { id: matchId }, data: { date } });
  } finally {
    // The sample's "demo" is a small text file; it never stays around.
    await deleteUploadDemo(prisma, upload.id);
    await unlink(filePath).catch(() => {});
  }
  return upload.id;
}

async function seedAccount() {
  const existing = await prisma.user.findUnique({ where: { email: LOCAL_USER.email }, select: { id: true } });
  if (existing) {
    console.log(`setup: konto testowe ${LOCAL_USER.email} już jest, pomijam przykładowe analizy`);
    return;
  }
  // steamId is unique: link the sample player only if nobody holds it yet.
  const steamTaken = await prisma.user.findUnique({ where: { steamId: FIXTURE_PLAYER_STEAM_ID }, select: { id: true } });
  const user = await prisma.user.create({
    data: {
      email: LOCAL_USER.email,
      name: LOCAL_USER.name,
      password: await bcrypt.hash(LOCAL_USER.password, 10),
      steamId: steamTaken ? null : FIXTURE_PLAYER_STEAM_ID,
      monthlyDemoLimit: 1000,
      // So the admin panel can be tested too. Local test database only.
      role: "ADMIN",
    },
  });

  const started = Date.now();
  let lastUploadId = "";
  for (const s of SAMPLES) {
    lastUploadId = await analyseSample(user.id, s);
    console.log(`setup: przykładowa analiza ${s.fileName} gotowa`);
  }
  await refreshNorms(prisma);
  await refreshPlanAfterAnalysis(prisma, lastUploadId);
  console.log(
    `setup: konto testowe ${LOCAL_USER.email} / ${LOCAL_USER.password} z ${SAMPLES.length} analizami (${((Date.now() - started) / 1000).toFixed(1)} s)`
  );
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/** Best effort: setup still succeeds offline, the guide says where else to get a demo. */
async function downloadSampleDemo() {
  if (process.env.SKIP_SAMPLE_DEMO === "1") return;
  const exists = await access(SAMPLE_DEMO.path).then(
    () => true,
    () => false
  );
  if (exists) {
    console.log(`setup: przykładowe demo jest w data/przyklad/`);
    return;
  }
  const part = `${SAMPLE_DEMO.path}.part`;
  try {
    await mkdir(join(process.cwd(), "data", "przyklad"), { recursive: true });
    console.log("setup: pobieram przykładowe demo (de_mirage, 60 MB)…");
    const res = await fetch(SAMPLE_DEMO.url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as WebReadableStream), createWriteStream(part));
    if ((await fileSha256(part)) !== SAMPLE_DEMO.sha256) throw new Error("zła suma kontrolna");
    await rename(part, SAMPLE_DEMO.path);
    console.log("setup: przykładowe demo zapisane w data/przyklad/de_mirage-przyklad.dem");
  } catch (err) {
    await unlink(part).catch(() => {});
    console.warn(
      `setup: nie udało się pobrać przykładowego dema (${err instanceof Error ? err.message : String(err)}). ` +
        "Wgraj dowolne własne demo, patrz docs/TESTOWANIE.md."
    );
  }
}

/**
 * /demo (S21) shows the newest pro demo; a fresh local setup has none, so the
 * example is the test account's first sample analysis (local database only).
 */
async function ensureDemoMatch() {
  if (await getDemoMatchId(prisma)) return;
  const sample = await prisma.demoUpload.findFirst({
    where: { user: { email: LOCAL_USER.email }, status: "COMPLETED", deletedAt: null, matchId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { matchId: true },
  });
  if (sample?.matchId && (await setDemoMatchId(prisma, sample.matchId))) {
    console.log("setup: przykładowa analiza bez logowania: http://localhost:3000/demo");
  }
}

async function main() {
  await ensureBucket();
  await seedAccount();
  await ensureDemoMatch();
  await downloadSampleDemo();
  console.log("setup: gotowe");
}

main()
  .catch((err) => {
    console.error("setup nie powiódł się:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
