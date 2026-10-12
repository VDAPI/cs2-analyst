/**
 * Before the suite: schema push, seed (scripts/e2e-seed.ts) and the parse
 * worker, all on the E2E database and Redis DB, with the fixture parser.
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import IORedis from "ioredis";
import { e2eEnv } from "./env";

export const WORKER_PID_FILE = "e2e/.state/worker.pid";

export default async function globalSetup() {
  mkdirSync("e2e/.state", { recursive: true });
  // A worker left over from an interrupted run would steal this run's jobs.
  if (existsSync(WORKER_PID_FILE)) {
    try {
      process.kill(-Number(readFileSync(WORKER_PID_FILE, "utf8")), "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  const env = { ...process.env, ...e2eEnv };

  execSync("npx prisma db push --skip-generate --accept-data-loss", { env, stdio: "inherit" });

  // Jobs left over from an earlier run must not reach this run's worker.
  const redis = new IORedis(e2eEnv.REDIS_URL, { maxRetriesPerRequest: 1 });
  await redis.flushdb();
  await redis.quit();

  execSync("npx tsx --tsconfig tsconfig.json scripts/e2e-seed.ts", { env, stdio: ["ignore", "ignore", "inherit"] });

  const log = openSync("e2e/.state/worker.log", "w");
  const worker = spawn("npx", ["tsx", "--tsconfig", "tsconfig.json", "workers/demo-parser.worker.ts"], {
    env,
    stdio: ["ignore", log, log],
    detached: true,
  });
  worker.unref();
  writeFileSync(WORKER_PID_FILE, String(worker.pid));
}
