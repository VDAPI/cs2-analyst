/**
 * FACEIT Downloads API — server-side only.
 *
 * Exchanges a demo resource URL (demo_url[0] from the Data API) for a
 * short-lived presigned S3 URL, then streams + decompresses the zstd demo
 * to disk with bounded memory.
 *
 * Never expose FACEIT_DOWNLOADS_API_KEY to the client. Signed URLs are
 * short-lived — exchange immediately before download, never persist them.
 */
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { once } from "node:events";
import { Decompress } from "fzstd";

const FACEIT_DOWNLOAD_API =
  "https://open.faceit.com/download/v2/demos/download";

/**
 * Thrown when a demo is not yet available (missing/empty resource URL, or a
 * 404 from the download gateway). Retryable — the demo may appear later.
 */
export class DemoNotReadyError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = "DemoNotReadyError";
  }
}

function getDownloadsApiKey(): string {
  const key = process.env.FACEIT_DOWNLOADS_API_KEY;
  if (!key) throw new Error("FACEIT_DOWNLOADS_API_KEY is not set");
  return key;
}

/**
 * Exchange a demo resource URL for a short-lived presigned S3 download URL.
 * Throws DemoNotReadyError on a 404 or empty resource (treat as "not ready").
 */
export async function getSignedDemoUrl(resourceUrl: string): Promise<string> {
  if (!resourceUrl || resourceUrl.trim().length === 0) {
    throw new DemoNotReadyError("Empty demo resource URL");
  }

  const res = await fetch(FACEIT_DOWNLOAD_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getDownloadsApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ resource_url: resourceUrl }),
  });

  if (res.status === 404) {
    throw new DemoNotReadyError(`Demo not found (404) for ${resourceUrl}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `FACEIT download API error: ${res.status} ${res.statusText} ${body}`
    );
  }

  const data = (await res.json()) as {
    payload?: { download_url?: string };
  };
  const signed = data.payload?.download_url;
  if (!signed) {
    throw new DemoNotReadyError("Download API returned no download_url");
  }
  return signed;
}

function toU8(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * Download a presigned URL to a temp path and stream-decompress the zstd
 * demo to `destPath`. Bounded memory — never buffers the whole file.
 *
 * Writes the compressed .zst next to destPath, deletes it immediately after
 * decompression. On any failure the partial .zst is cleaned up; the caller
 * is responsible for cleaning up destPath in its own finally block.
 */
export async function downloadAndDecompressDemo(
  signedUrl: string,
  destPath: string
): Promise<void> {
  const zstPath = `${destPath}.zst`;

  // 1. Stream the download to disk (plain GET, no extra headers).
  const res = await fetch(signedUrl);
  if (res.status === 404) {
    throw new DemoNotReadyError(`Signed URL 404 — demo not ready`);
  }
  if (!res.ok || !res.body) {
    throw new Error(`Demo download failed: ${res.status} ${res.statusText}`);
  }

  try {
    const out = createWriteStream(zstPath);
    // Node's fetch body is a web ReadableStream; drain it into the file with
    // backpressure so a 100-300MB download never sits fully in memory.
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!out.write(value)) await once(out, "drain");
      }
    } finally {
      reader.releaseLock();
    }
    await new Promise<void>((resolve, reject) =>
      out.end((err?: Error | null) => (err ? reject(err) : resolve()))
    );

    // 2. Stream-decompress zstd -> .dem with bounded memory. fzstd's
    // Decompress fires ondata synchronously during push(); we buffer the
    // emitted chunks per input read and flush them with write-backpressure.
    await decompressFile(zstPath, destPath);
  } finally {
    // Compressed file is never needed again — remove it right away.
    await unlink(zstPath).catch(() => {});
  }
}

async function decompressFile(src: string, dest: string): Promise<void> {
  const out = createWriteStream(dest);
  const pending: Uint8Array[] = [];
  const dec = new Decompress((chunk) => {
    // Copy — fzstd may reuse its internal buffer across callbacks.
    pending.push(chunk.slice());
  });

  async function flush(): Promise<void> {
    for (const chunk of pending) {
      if (!out.write(chunk)) await once(out, "drain");
    }
    pending.length = 0;
  }

  const input = createReadStream(src, { highWaterMark: 1 << 20 }); // 1 MiB
  try {
    for await (const chunk of input) {
      dec.push(toU8(chunk as Buffer));
      await flush(); // keeps memory bounded to ~one input chunk's worth
    }
    dec.push(new Uint8Array(0), true);
    await flush();
  } finally {
    await new Promise<void>((resolve, reject) =>
      out.end((err?: Error | null) => (err ? reject(err) : resolve()))
    );
  }
}
