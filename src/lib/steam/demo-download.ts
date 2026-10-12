/**
 * Downloads a Premier / matchmaking demo from a Valve replay link
 * (replayN.valve.net/730/<match>_<n>.dem.bz2) and decompresses it to disk.
 * Only links that pass parseReplayUrl() are ever fetched.
 */
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import unbzip2Stream from "unbzip2-stream";
import { parseReplayUrl } from "./share-code";

/** Decompressed size cap — a real CS2 demo is well below this. */
const MAX_DEMO_BYTES = 1.5 * 1024 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 700 * 1024 * 1024;

export class ReplayGoneError extends Error {}

function byteLimit(max: number, what: string): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      seen += chunk.length;
      if (seen > max) cb(new Error(`${what} larger than ${Math.round(max / 1024 / 1024)} MB`));
      else cb(null, chunk);
    },
  });
}

export async function downloadReplayDemo(rawUrl: string, destPath: string): Promise<void> {
  const url = parseReplayUrl(rawUrl);
  if (!url) throw new Error("Not a Valve replay link");

  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10 * 60_000) });
  if (res.status === 404 || res.status === 410) {
    // Valve keeps replays for about a month.
    throw new ReplayGoneError("The replay is no longer available on Valve's servers");
  }
  if (!res.ok || !res.body) throw new Error(`Replay download failed (${res.status})`);

  try {
    await pipeline(
      Readable.fromWeb(res.body as import("node:stream/web").ReadableStream<Uint8Array>),
      byteLimit(MAX_COMPRESSED_BYTES, "Replay"),
      unbzip2Stream(),
      byteLimit(MAX_DEMO_BYTES, "Demo"),
      createWriteStream(destPath)
    );
  } catch (err) {
    await unlink(destPath).catch(() => {});
    throw err;
  }
}
