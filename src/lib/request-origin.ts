/**
 * The origin (scheme://host:port) the browser used for this request, worked
 * out the same way NextAuth v4 does it (utils/detect-origin.js): with
 * AUTH_TRUST_HOST the forwarded / Host headers, otherwise NEXTAUTH_URL.
 *
 * The local Docker setup (S20) serves one app on several addresses at once
 * (http://localhost:3000, http://<Wi-Fi IP>:3000 on a phone,
 * https://localhost:3443), so a redirect built from NEXTAUTH_URL sends a
 * phone to "localhost", which is the phone itself.
 */
export function requestOrigin(headers: Headers, requestUrl?: string): string {
  const fallback = (process.env.NEXTAUTH_URL || requestUrl || "http://localhost:3000").replace(/\/+$/, "");
  if (!trustHost()) return safeOrigin(fallback) ?? "http://localhost:3000";
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const host = first(headers.get("x-forwarded-host")) ?? first(headers.get("host"));
  if (!host) return safeOrigin(fallback) ?? "http://localhost:3000";
  let proto = first(headers.get("x-forwarded-proto"));
  if (!proto && requestUrl) proto = safeProtocol(requestUrl);
  return safeOrigin(`${proto === "http" ? "http" : "https"}://${host}`) ?? safeOrigin(fallback) ?? "http://localhost:3000";
}

function trustHost(): boolean {
  const v = process.env.VERCEL ?? process.env.AUTH_TRUST_HOST;
  return !!v && v !== "false" && v !== "0";
}

function safeOrigin(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

function safeProtocol(url: string): string | null {
  try {
    return new URL(url).protocol.replace(":", "");
  } catch {
    return null;
  }
}
