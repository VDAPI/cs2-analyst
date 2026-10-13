/**
 * Discord interaction signatures (S26): every request to the interactions
 * endpoint carries `X-Signature-Ed25519` over `timestamp + raw body`, made
 * with the application's key; the public half is DISCORD_PUBLIC_KEY (hex).
 */
import { createPublicKey, verify, type KeyObject } from "crypto";

/** DER prefix of an Ed25519 SubjectPublicKeyInfo; the 32 raw key bytes follow. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const HEX = /^[0-9a-f]+$/i;

const keyCache = new Map<string, KeyObject>();

function publicKey(hex: string): KeyObject | null {
  if (hex.length !== 64 || !HEX.test(hex)) return null;
  let key = keyCache.get(hex);
  if (!key) {
    key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(hex, "hex")]),
      format: "der",
      type: "spki",
    });
    keyCache.set(hex, key);
  }
  return key;
}

/** Signatures older than this are refused (replays of a captured request). */
export const SIGNATURE_MAX_AGE_S = 5 * 60;

export function verifyDiscordSignature(opts: {
  publicKeyHex: string | undefined;
  signature: string | null;
  timestamp: string | null;
  body: string;
  nowSeconds?: number;
}): boolean {
  const { signature, timestamp, body } = opts;
  if (!opts.publicKeyHex || !signature || !timestamp) return false;
  if (signature.length !== 128 || !HEX.test(signature) || !/^\d{1,12}$/.test(timestamp)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > SIGNATURE_MAX_AGE_S) return false;
  const key = publicKey(opts.publicKeyHex.trim());
  if (!key) return false;
  try {
    return verify(null, Buffer.from(timestamp + body, "utf8"), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
