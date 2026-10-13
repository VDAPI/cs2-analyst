/**
 * Decoded RoundTicks shared by the steps of one analysis (S28).
 *
 * After the parse, mechanics, aim, utility, tactics, norms (whole match and
 * per side) and win probability each load and decode the same blobs; that was
 * ~10 decodes of every round. Inside `withDecodeCache` a blob is decoded once.
 * Callers treat frames as read-only (none of the analyses mutate them), so
 * sharing them is safe. Outside the scope it is plain `decodeRoundTicks`.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { decodeRoundTicks, type ReplayFrame } from "./round-ticks";

type Rec = Parameters<typeof decodeRoundTicks>[0];

const scope = new AsyncLocalStorage<Map<string, ReplayFrame[]>>();

export function withDecodeCache<T>(run: () => Promise<T>): Promise<T> {
  return scope.run(new Map(), run);
}

export function decodeRoundTicksCached(rec: Rec): ReplayFrame[] {
  const cache = scope.getStore();
  if (!cache) return decodeRoundTicks(rec);
  const key = [
    rec.version,
    rec.startTick,
    rec.interval,
    rec.frameCount,
    JSON.stringify(rec.players),
    JSON.stringify(rec.weapons),
    createHash("sha1").update(rec.data).digest("hex"),
  ].join("|");
  let frames = cache.get(key);
  if (!frames) {
    frames = decodeRoundTicks(rec);
    cache.set(key, frames);
  }
  return frames;
}
