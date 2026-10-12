/**
 * E2E seed (S19): wipes the E2E database and fills it through the real
 * pipeline — the E2E account, three analysed matches and one pro demo, each
 * a fixture demo (src/lib/parsers/fixture-demo.ts) run through
 * parseAndPersistDemo exactly like the parse worker does.
 *
 * Run by e2e/global-setup.ts with the E2E environment (E2E_FIXTURE_DEMOS=1,
 * the E2E DATABASE_URL). Refuses to run against any other database.
 * Writes the seeded ids to e2e/.state/seed.json for the specs.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { parseAndPersistDemo } from "../src/lib/parsers/persist-demo";
import { finalizeDemoAfterAnalysis, LOCAL_DEMO_DIR } from "../src/lib/storage/demo-store";
import { getProPoolUserId } from "../src/lib/norms/pro-pool";
import { refreshNorms } from "../src/lib/norms/persist";
import {
  DEFAULT_FIXTURE_ROUNDS,
  FIXTURE_PLAYER_STEAM_ID,
  fixtureDemoText,
  type FixtureOutcome,
} from "../src/lib/parsers/fixture-demo";
import { E2E_USER, SEED_STATE_FILE, type SeedState } from "../e2e/env";

if (process.env.E2E_FIXTURE_DEMOS !== "1" || !/_e2e\b|e2e/.test(process.env.DATABASE_URL ?? "")) {
  console.error("e2e-seed: refusing to run outside the E2E environment (E2E_FIXTURE_DEMOS=1 and an *_e2e DATABASE_URL)");
  process.exit(1);
}

const prisma = new PrismaClient();

/** Team A (the account's team) loses 7–10. */
const LOSS_ROUNDS: FixtureOutcome[] = [
  "T:elim", "CT:elim", "CT:elim", "T:bomb", "CT:defuse", "CT:elim",
  "T:elim", "CT:time", "CT:elim", "T:elim", "CT:elim", "CT:elim",
  "CT:elim", "T:bomb", "CT:elim", "T:elim", "CT:elim",
];

/** Team A wins 13–8. */
const CLOSE_WIN_ROUNDS: FixtureOutcome[] = [
  "CT:elim", "T:elim", "T:bomb", "CT:elim", "T:elim", "CT:defuse", "T:elim",
  "CT:elim", "T:elim", "T:bomb", "CT:elim", "T:elim",
  "CT:elim", "T:elim", "CT:defuse", "CT:elim", "T:bomb", "CT:elim", "CT:elim", "CT:elim", "CT:elim",
];

// Fixed dates keep the screens (and their screenshots) stable.
const SEEDED = [
  { seed: 1, rounds: DEFAULT_FIXTURE_ROUNDS, date: "2026-10-03T19:00:00Z", fileName: "e2e-mirage-wygrana.dem" },
  { seed: 3, rounds: LOSS_ROUNDS, date: "2026-10-02T19:00:00Z", fileName: "e2e-mirage-przegrana.dem" },
  { seed: 4, rounds: CLOSE_WIN_ROUNDS, date: "2026-10-01T19:00:00Z", fileName: "e2e-mirage-blisko.dem" },
];

async function analyse(opts: {
  userId: string;
  seed: number;
  rounds: FixtureOutcome[];
  teamA?: "account" | "other";
  fileName: string;
  date: Date;
  pro?: boolean;
}): Promise<{ uploadId: string; matchId: string }> {
  const upload = await prisma.demoUpload.create({
    data: {
      userId: opts.userId,
      fileName: opts.fileName,
      fileSize: 0,
      fileUrl: "",
      status: "QUEUED",
      pro: opts.pro ?? false,
      proLabel: opts.pro ? "E2E: pro fixture, de_mirage" : null,
      createdAt: opts.date,
    },
  });
  const filePath = join(LOCAL_DEMO_DIR, `${upload.id}.dem`);
  const text = fixtureDemoText(opts.seed, opts.rounds, opts.teamA);
  await mkdir(LOCAL_DEMO_DIR, { recursive: true });
  await writeFile(filePath, text);
  await prisma.demoUpload.update({
    where: { id: upload.id },
    data: { fileUrl: filePath, fileSize: Buffer.byteLength(text) },
  });
  const { matchId, replayStored } = await parseAndPersistDemo(prisma, { uploadId: upload.id, filePath });
  if (!replayStored) throw new Error(`e2e-seed: replay data was not stored for seed ${opts.seed}`);
  await finalizeDemoAfterAnalysis(prisma, upload.id, replayStored);
  await prisma.match.update({ where: { id: matchId }, data: { date: opts.date } });
  return { uploadId: upload.id, matchId };
}

async function main() {
  const started = Date.now();
  // Child tables first; TRUNCATE ... CASCADE keeps this independent of the schema's FK order.
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`
    );
  }

  const user = await prisma.user.create({
    data: {
      email: E2E_USER.email,
      name: E2E_USER.name,
      password: await bcrypt.hash(E2E_USER.password, 10),
      steamId: FIXTURE_PLAYER_STEAM_ID,
      monthlyDemoLimit: 100,
      // Admin screens are part of the suite (ADMIN_EMAILS never grants admin at runtime).
      role: "ADMIN",
      // The report guide (S21) would cover the report screenshots; its own spec opens it by hand.
      reportTourAt: new Date("2026-09-01T12:00:00Z"),
      createdAt: new Date("2026-09-01T12:00:00Z"),
    },
  });

  const uploads: Array<{ uploadId: string; matchId: string }> = [];
  for (const s of SEEDED) {
    uploads.push(
      await analyse({ userId: user.id, seed: s.seed, rounds: s.rounds, fileName: s.fileName, date: new Date(s.date) })
    );
  }

  const pro = await analyse({
    userId: await getProPoolUserId(prisma),
    seed: 9,
    rounds: DEFAULT_FIXTURE_ROUNDS,
    teamA: "other",
    fileName: "e2e-pro-mirage.dem",
    date: new Date("2026-09-20T15:00:00Z"),
    pro: true,
  });
  await refreshNorms(prisma);

  const players = await prisma.matchPlayer.findMany({
    where: { matchId: uploads[0].matchId },
    select: { steamId: true, team: true },
  });
  const own = players.find((p) => p.steamId === FIXTURE_PLAYER_STEAM_ID)!;
  const state: SeedState = {
    userId: user.id,
    matchIds: uploads.map((u) => u.matchId),
    uploadIds: uploads.map((u) => u.uploadId),
    proMatchId: pro.matchId,
    playerSteamId: own.steamId,
    teammateSteamId: players.find((p) => p.team === own.team && p.steamId !== own.steamId)!.steamId,
    opponentSteamId: players.find((p) => p.team !== own.team)!.steamId,
  };
  await mkdir(dirname(SEED_STATE_FILE), { recursive: true });
  await writeFile(SEED_STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`e2e-seed: ${uploads.length} matches + 1 pro demo in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main()
  .catch((err) => {
    console.error("e2e-seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
