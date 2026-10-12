/**
 * Retraining the win-probability model without anyone running a command
 * (S14). After each analysis the parse worker calls requestTraining():
 *
 * - with ML_SERVICE_URL set (the `ml` service in docker-compose.yml) it
 *   pings POST /train; the service decides whether there is new data,
 * - otherwise it runs `python3 -m cs2ml.train --if-new-data` from ml/
 *   itself, at most every TRAIN_EVERY_MS, when Python with the trainer's
 *   packages is installed (`pip install -r ml/requirements.txt`). Without
 *   Python the app keeps scoring with the prior; that is logged once.
 *
 * Training never blocks or fails an analysis.
 */
import { spawn } from "child_process";
import path from "path";
import { clearModelCache } from "./persist";

const TRAIN_EVERY_MS = 30 * 60_000;
let lastLocalRun = 0;
let running = false;
let warned = false;

export function mlServiceUrl(): string | null {
  const url = process.env.ML_SERVICE_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

/** Ask for a retrain when there is new data. Fire and forget. */
export async function requestTraining(opts: { force?: boolean; log?: (line: string) => void } = {}): Promise<string> {
  const log = opts.log ?? ((line: string) => console.log(`[winprob] ${line}`));
  const service = mlServiceUrl();
  if (service) {
    try {
      const res = await fetch(`${service}/train${opts.force ? "?force=1" : ""}`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
      const body = (await res.json().catch(() => ({}))) as { status?: string };
      clearModelCache();
      return `service: ${body.status ?? res.status}`;
    } catch (error) {
      log(`ML service unreachable (${service}): ${error instanceof Error ? error.message : String(error)}`);
      return "service unreachable";
    }
  }
  if (running) return "already running";
  if (!opts.force && Date.now() - lastLocalRun < TRAIN_EVERY_MS) return "throttled";
  lastLocalRun = Date.now();
  return runLocalTrainer(opts.force ?? false, log);
}

function runLocalTrainer(force: boolean, log: (line: string) => void): Promise<string> {
  const python = process.env.ML_PYTHON?.trim() || "python3";
  const cwd = path.join(process.cwd(), "ml");
  const args = ["-m", "cs2ml.train", ...(force ? [] : ["--if-new-data"])];
  running = true;
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawn(python, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      running = false;
      resolve(`not started: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (out += d.toString()));
    child.on("error", (error) => {
      running = false;
      if (!warned) {
        warned = true;
        log(`no Python trainer (${python}: ${error.message}); scoring with the prior. Install: pip install -r ml/requirements.txt`);
      }
      resolve("no python");
    });
    child.on("close", (code) => {
      running = false;
      clearModelCache();
      const last = out.trim().split("\n").at(-1) ?? "";
      if (code !== 0 && !warned) {
        warned = true;
        log(`trainer exited with ${code}: ${out.trim().slice(-500)}`);
      } else if (code === 0) {
        log(`trainer: ${last}`);
      }
      resolve(code === 0 ? last : `exit ${code}`);
    });
  });
}
