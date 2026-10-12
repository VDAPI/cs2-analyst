import { existsSync, readFileSync, rmSync } from "node:fs";
import { WORKER_PID_FILE } from "./global-setup";

/** Stop the parse worker started by global-setup (its whole process group). */
export default async function globalTeardown() {
  if (!existsSync(WORKER_PID_FILE)) return;
  const pid = Number(readFileSync(WORKER_PID_FILE, "utf8"));
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  rmSync(WORKER_PID_FILE, { force: true });
}
