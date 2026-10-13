/**
 * How many parse processes the parse worker runs (S28). demoparser2 blocks
 * its process for a whole native parse, so only separate processes analyse
 * demos side by side; each one needs up to ~1 GB for a long match.
 *
 * PARSE_WORKERS=N asks for N (capped at the core count); unset, a machine
 * with at least 4 cores and 12 GB of RAM gets 2, anything smaller 1.
 */
export function parseProcessCount(env: string | undefined, cores: number, memBytes: number): number {
  const asked = Number(env);
  if (env && Number.isFinite(asked) && asked >= 1) return Math.min(Math.floor(asked), Math.max(1, cores));
  return cores >= 4 && memBytes >= 12 * 1024 ** 3 ? 2 : 1;
}
