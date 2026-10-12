/**
 * Minimal Cloudflare R2 client (S3 API, AWS Signature V4) — server-side only.
 *
 * Only the three calls the demo pipeline needs: put a file, download an
 * object to a file, delete an object. Hand-rolled on node:crypto + fetch so
 * we don't pull the whole AWS SDK in for it.
 *
 * Configured with R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and
 * R2_BUCKET. Without them demos stay on local disk (see demo-store.ts).
 */
import { createHash, createHmac } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { once } from "node:events";
import { Readable } from "node:stream";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

// ─── Signature V4 ────────────────────────────────────────

const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** RFC 3986 encoding as S3 expects it for each path segment. */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export interface SignInput {
  method: string;
  host: string;
  /** Unencoded object path, starting with "/". */
  path: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Extra headers to sign (lower-case names), e.g. range, content-length. */
  headers?: Record<string, string>;
  /** Hex SHA-256 of the body, or "UNSIGNED-PAYLOAD". */
  payloadHash: string;
  date: Date;
}

/**
 * Build the signed headers for one S3 request. Exported for the regression
 * test, which checks it against the AWS documentation example.
 */
export function signS3Request(input: SignInput): Record<string, string> {
  const amzDate = input.date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    host: input.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": amzDate,
  };
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    headers[k.toLowerCase()] = v.trim();
  }
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalPath = input.path.split("/").map(encodeSegment).join("/");

  const canonicalRequest = [
    input.method,
    canonicalPath,
    "", // no query string
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  const scope = `${day}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${input.secretAccessKey}`, day);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const out: Record<string, string> = { ...headers };
  delete out.host; // fetch sets Host itself
  return {
    ...out,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// ─── Object operations ───────────────────────────────────

function objectTarget(cfg: R2Config, key: string) {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const path = `/${cfg.bucket}/${key}`;
  const url = `https://${host}${path.split("/").map(encodeSegment).join("/")}`;
  return { host, path, url };
}

function signed(
  cfg: R2Config,
  method: string,
  key: string,
  payloadHash: string,
  headers: Record<string, string> = {}
) {
  const { host, path, url } = objectTarget(cfg, key);
  return {
    url,
    headers: signS3Request({
      method,
      host,
      path,
      region: "auto",
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      headers,
      payloadHash,
      date: new Date(),
    }),
  };
}

/** Upload a local file as `key`. Streams the body (demos are up to 700 MB). */
export async function r2PutFile(cfg: R2Config, key: string, filePath: string): Promise<void> {
  const { size } = await stat(filePath);
  const req = signed(cfg, "PUT", key, "UNSIGNED-PAYLOAD", {
    "content-length": String(size),
    "content-type": "application/octet-stream",
  });
  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
  const res = await fetch(req.url, {
    method: "PUT",
    headers: req.headers,
    body,
    // Required by Node's fetch for a streamed request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 PUT ${key} failed: ${res.status} ${text.slice(0, 300)}`);
  }
}

/** Download `key` to a local file with bounded memory. */
export async function r2GetToFile(cfg: R2Config, key: string, destPath: string): Promise<void> {
  const req = signed(cfg, "GET", key, EMPTY_SHA256);
  const res = await fetch(req.url, { headers: req.headers });
  if (!res.ok || !res.body) {
    throw new Error(`R2 GET ${key} failed: ${res.status} ${res.statusText}`);
  }
  const out = createWriteStream(destPath);
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(value)) await once(out, "drain");
    }
    out.end();
    await once(out, "finish");
  } catch (err) {
    out.destroy();
    await unlink(destPath).catch(() => {});
    throw err;
  }
}

/** Delete `key`. Deleting a missing object is not an error in S3/R2. */
export async function r2Delete(cfg: R2Config, key: string): Promise<void> {
  const req = signed(cfg, "DELETE", key, EMPTY_SHA256);
  const res = await fetch(req.url, { method: "DELETE", headers: req.headers });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE ${key} failed: ${res.status} ${res.statusText}`);
  }
}
