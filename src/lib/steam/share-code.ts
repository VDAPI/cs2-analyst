/**
 * CS2 / CS:GO match share codes ("CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx").
 *
 * A share code packs 18 bytes — match id (uint64 LE), outcome / reservation
 * id (uint64 LE) and the TV port (uint16 LE) — into 25 base-57 characters,
 * least significant digit first. Pure, no I/O; covered by `npm run test:platform`.
 */

const DICTIONARY = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789";
const BASE = BigInt(DICTIONARY.length);
// BigInt() instead of 0n literals: tsconfig targets ES2017.
const B0 = BigInt(0);
const B8 = BigInt(8);
const BFF = BigInt(0xff);
const B144 = BigInt(144);
const SHARE_CODE_RE =
  /^CSGO(-[ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789]{5}){5}$/;

export interface DecodedShareCode {
  /** uint64 as a decimal string (JSON- and Prisma-safe). */
  matchId: string;
  outcomeId: string;
  tvPort: number;
}

/** Normalizes whitespace and an optional steam:// link around a share code. */
export function extractShareCode(input: string): string | null {
  const m = input.trim().match(/CSGO(?:-[A-Za-z0-9]{5}){5}/);
  if (!m) return null;
  return SHARE_CODE_RE.test(m[0]) ? m[0] : null;
}

export function isShareCode(code: string): boolean {
  return SHARE_CODE_RE.test(code);
}

function readUint64LE(bytes: Uint8Array, offset: number): bigint {
  let v = B0;
  for (let i = 7; i >= 0; i--) v = (v << B8) | BigInt(bytes[offset + i]);
  return v;
}

function writeUint64LE(bytes: Uint8Array, offset: number, v: bigint) {
  for (let i = 0; i < 8; i++) {
    bytes[offset + i] = Number(v & BFF);
    v >>= B8;
  }
}

export function decodeShareCode(code: string): DecodedShareCode {
  if (!isShareCode(code)) throw new Error(`Invalid share code: ${code}`);
  const chars = code.slice(5).replace(/-/g, "");

  let big = B0;
  for (let i = chars.length - 1; i >= 0; i--) {
    big = big * BASE + BigInt(DICTIONARY.indexOf(chars[i]));
  }
  if (big >> B144 !== B0) throw new Error(`Invalid share code: ${code}`);

  // 18 bytes, big-endian as a whole.
  const bytes = new Uint8Array(18);
  for (let i = 17; i >= 0; i--) {
    bytes[i] = Number(big & BFF);
    big >>= B8;
  }

  return {
    matchId: readUint64LE(bytes, 0).toString(),
    outcomeId: readUint64LE(bytes, 8).toString(),
    tvPort: bytes[16] | (bytes[17] << 8),
  };
}

export function encodeShareCode({ matchId, outcomeId, tvPort }: DecodedShareCode): string {
  const bytes = new Uint8Array(18);
  writeUint64LE(bytes, 0, BigInt(matchId));
  writeUint64LE(bytes, 8, BigInt(outcomeId));
  bytes[16] = tvPort & 0xff;
  bytes[17] = (tvPort >> 8) & 0xff;

  let big = B0;
  for (const b of bytes) big = (big << B8) | BigInt(b);

  let chars = "";
  for (let i = 0; i < 25; i++) {
    chars += DICTIONARY[Number(big % BASE)];
    big /= BASE;
  }
  return `CSGO-${chars.match(/.{5}/g)!.join("-")}`;
}

// ─── Valve replay links ─────────────────────────────────

/**
 * Only Valve's own replay servers are accepted, so the download worker can
 * never be pointed at an arbitrary host (SSRF).
 * Format: http://replay183.valve.net/730/003418253939418218633_1094658064.dem.bz2
 */
const REPLAY_HOST_RE = /^replay\d{1,4}\.valve\.net$/;
const REPLAY_PATH_RE = /^\/730\/\d{1,25}_\d{1,12}\.dem\.bz2$/;

export function parseReplayUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.port) return null;
  if (!REPLAY_HOST_RE.test(url.hostname)) return null;
  if (!REPLAY_PATH_RE.test(url.pathname) || url.search || url.hash) return null;
  return `${url.protocol}//${url.hostname}${url.pathname}`;
}

/** Match id embedded in a replay link (first number), for matching it to a share code. */
export function replayUrlMatchId(url: string): string | null {
  const m = url.match(/\/730\/(\d+)_\d+\.dem\.bz2$/);
  return m ? BigInt(m[1]).toString() : null;
}
