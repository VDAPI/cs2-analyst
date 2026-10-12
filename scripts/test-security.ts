/**
 * Regression test for S29: security and privacy. Run: npm run test:security
 *
 * 1. .dem validation: CS2 magic passes, CS:GO / junk / fixtures (outside E2E) don't.
 * 2. Rate limiter: fixed windows, per key, reset, Retry-After; client IP read
 *    from the right of X-Forwarded-For (a spoofed left entry changes nothing).
 * 3. Request body limits per API path.
 * 4. Security headers: CSP blocks framing/plugins, no eval in production, HSTS only on https.
 * 5. Account deletion confirmation words; legal texts PL/EN in step.
 * 6. Endpoint permissions (static): every API route authenticates or is a
 *    known public route, every admin route and admin page checks the role
 *    itself, and the expensive / abusable routes are rate-limited.
 *
 * No database, Redis or network needed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { classifyDemoHeader, CS2_DEMO_MAGIC, CSGO_DEMO_MAGIC, demoHeaderError } from "@/lib/security/demo-file";
import { clientIp, decide, hitRateLimit, MemoryStore, RATE_RULES, windowStart } from "@/lib/security/rate-limit";
import { bodyLimitFor, DEFAULT_BODY_LIMIT } from "@/lib/security/body-limit";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";
import { isDeleteConfirmation } from "@/lib/account/delete";
import { legalDoc } from "@/lib/legal/content";
import { fixtureDemoText } from "@/lib/parsers/fixture-demo";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const bytes = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));

async function main() {
  // ─── 1. .dem validation ──────────────────────────────────
  check("CS2 demo passes", classifyDemoHeader(bytes(`${CS2_DEMO_MAGIC}\x01\x02rest`), false) === "cs2");
  check("CS:GO demo is recognised", classifyDemoHeader(bytes(`${CSGO_DEMO_MAGIC}xx`), false) === "csgo");
  check("CS:GO demo is refused with its own message", /CS:GO/.test(demoHeaderError("csgo") ?? ""));
  check("zip renamed to .dem is refused", demoHeaderError(classifyDemoHeader(bytes("PK\x03\x04abcdefgh"), false)) !== null);
  check("empty file is refused", classifyDemoHeader(new Uint8Array(), false) === "unknown");
  check("magic without NUL is refused", classifyDemoHeader(bytes("PBDEMS2x"), false) === "unknown");
  const fixture = bytes(fixtureDemoText(1));
  check("fixture demo refused outside E2E", classifyDemoHeader(fixture, false) === "unknown");
  check("fixture demo accepted in E2E", classifyDemoHeader(fixture, true) === "fixture");

  // ─── 2. Rate limiter ─────────────────────────────────────
  const rule = { max: 3, windowMs: 60_000 };
  check("window start aligns", windowStart(rule, 125_000) === 120_000);
  check("3rd hit allowed", decide(rule, 3, 180_000, 125_000).allowed);
  const fourth = decide(rule, 4, 180_000, 125_000);
  check("4th hit refused, retry after 55 s", !fourth.allowed && fourth.retryAfter === 55 && fourth.remaining === 0);

  const store = new MemoryStore();
  const t0 = 10 * RATE_RULES.register.windowMs; // start of a window
  const results = [];
  for (let i = 0; i < RATE_RULES.register.max + 1; i++) {
    results.push(await hitRateLimit("register", "1.2.3.4", { store, now: t0 + i }));
  }
  check("register: max allowed", results.slice(0, -1).every((r) => r.allowed));
  check("register: one more refused", !results[results.length - 1].allowed);
  check("other key unaffected", (await hitRateLimit("register", "5.6.7.8", { store, now: t0 })).allowed);
  check(
    "next window allowed again",
    (await hitRateLimit("register", "1.2.3.4", { store, now: t0 + RATE_RULES.register.windowMs })).allowed
  );
  check("rules are independent", (await hitRateLimit("upload", "1.2.3.4", { store, now: t0 })).allowed);

  check("one proxy: right-most hop is the client", clientIp({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }, 1) === "1.2.3.4");
  check("spoofed left entry ignored", clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 1.2.3.4" }), 1) === "1.2.3.4");
  check("two proxies: second from the right", clientIp({ "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.1" }, 2) === "1.2.3.4");
  check("short chain falls back to the left-most", clientIp({ "x-forwarded-for": "1.2.3.4" }, 3) === "1.2.3.4");
  check("x-real-ip fallback", clientIp({ "x-real-ip": "4.4.4.4" }, 1) === "4.4.4.4");
  check("no headers → unknown", clientIp({}, 1) === "unknown");
  check("AI daily cap matches the coach's", RATE_RULES.coachAiDaily.max === 40);

  // ─── 3. Body limits ──────────────────────────────────────
  check("JSON routes: 64 KB", bodyLimitFor("/api/auth/register") === DEFAULT_BODY_LIMIT);
  check("upload route: demo size", bodyLimitFor("/api/uploads") > 700 * 1024 * 1024);
  check("/api/uploads/<id> is JSON", bodyLimitFor("/api/uploads/abc") === DEFAULT_BODY_LIMIT);
  check("avatar: 5 MB", bodyLimitFor("/api/user/avatar") === 5 * 1024 * 1024);

  // ─── 4. Headers ──────────────────────────────────────────
  const prodCsp = contentSecurityPolicy({ dev: false });
  check("CSP forbids framing", prodCsp.includes("frame-ancestors 'none'"));
  check("CSP forbids plugins", prodCsp.includes("object-src 'none'"));
  check("CSP pins <base>", prodCsp.includes("base-uri 'self'"));
  check("no eval in production", !prodCsp.includes("unsafe-eval"));
  check("eval allowed in dev (Turbopack)", contentSecurityPolicy({ dev: true }).includes("unsafe-eval"));
  check(
    "Sentry ingest allowed only when set",
    contentSecurityPolicy({ dev: false, sentryDsn: "https://k@o1.ingest.sentry.io/2" }).includes("https://o1.ingest.sentry.io") &&
      !prodCsp.includes("sentry")
  );
  const names = (o: Parameters<typeof securityHeaders>[0]) => securityHeaders(o).map((h) => h.key);
  check("nosniff + DENY + referrer", ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"].every((k) => names({ dev: false }).includes(k)));
  check("HSTS on https", names({ dev: false, appUrl: "https://cs2.example" }).includes("Strict-Transport-Security"));
  check("no HSTS on https localhost / IP (S20 local setup)", !names({ dev: false, appUrl: "https://localhost:3443" }).includes("Strict-Transport-Security") && !names({ dev: false, appUrl: "https://192.168.1.5:3443" }).includes("Strict-Transport-Security"));
  check("no HSTS on http / dev", !names({ dev: false, appUrl: "http://localhost:3100" }).includes("Strict-Transport-Security") && !names({ dev: true, appUrl: "https://localhost:3000" }).includes("Strict-Transport-Security"));

  // ─── 5. Account deletion + legal texts ───────────────────
  check("USUŃ confirms", isDeleteConfirmation(" usuń "));
  check("DELETE confirms", isDeleteConfirmation("DELETE"));
  check("anything else doesn't", !isDeleteConfirmation("tak") && !isDeleteConfirmation(""));
  for (const kind of ["privacy", "terms"] as const) {
    const pl = legalDoc(kind, "pl");
    const en = legalDoc(kind, "en");
    check(`${kind}: PL and EN have the same sections`, pl.sections.length === en.sections.length && pl.sections.length > 5);
  }

  // ─── 6. Endpoint permissions (static review) ─────────────
  const root = join(process.cwd(), "src/app");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  const routes = files(join(root, "api")).filter((f) => f.endsWith("route.ts"));
  // Public on purpose, each with its own guard.
  const PUBLIC: Record<string, RegExp> = {
    "api/auth/register/route.ts": /rateLimit\("register"/, // per-IP limit
    "api/faceit/webhooks/demo-ready/route.ts": /timingSafeEqual/, // shared secret
    "api/auth/[...nextauth]/route.ts": /NextAuth/,
    "api/billing/webhook/route.ts": /verifyStripeSignature\(/, // Stripe-Signature HMAC
  };
  const AUTH = /getServerSession|getAdminUser|getMatchAccess|ownMatchWhere/;
  const unguarded: string[] = [];
  for (const f of routes) {
    const rel = relative(root, f).replace(/\\/g, "/");
    const src = readFileSync(f, "utf8");
    const pub = PUBLIC[rel];
    if (pub ? !pub.test(src) : !AUTH.test(src)) unguarded.push(rel);
    if (rel.startsWith("api/admin/") && !src.includes("getAdminUser")) unguarded.push(`${rel} (no admin check)`);
  }
  check(`every API route is guarded${unguarded.length ? `: ${unguarded.join(", ")}` : ""}`, unguarded.length === 0);
  check("debug route is development-only", /NODE_ENV !== "development"/.test(readFileSync(join(root, "api/debug/user/route.ts"), "utf8")));

  const adminPages = files(join(root, "(dashboard)/admin")).filter((f) => f.endsWith("page.tsx"));
  const openAdmin = adminPages.filter((f) => !readFileSync(f, "utf8").includes("requireAdminPage()"));
  check(
    `every admin page checks the role itself${openAdmin.length ? `: ${openAdmin.map((f) => relative(root, f)).join(", ")}` : ""}`,
    adminPages.length >= 4 && openAdmin.length === 0
  );

  const LIMITED: Record<string, string> = {
    "api/uploads/route.ts": "upload",
    "api/scouting/route.ts": "scouting",
    "api/coach/match/route.ts": "coach",
    "api/coach/plan/route.ts": "coach",
    "api/faceit/sync/route.ts": "sync",
    "api/steam/sync/route.ts": "sync",
    "api/faceit/analyze/route.ts": "analyze",
    "api/uploads/[id]/retry/route.ts": "analyze",
    "api/user/avatar/route.ts": "avatar",
    "api/user/account/route.ts": "account",
    "api/user/export/route.ts": "account",
    "api/shares/route.ts": "write",
    "api/teams/route.ts": "write",
    "api/teams/join/route.ts": "teamJoin",
    "api/teams/[teamId]/route.ts": "write",
    "api/teams/[teamId]/members/[memberId]/route.ts": "write",
    "api/teams/[teamId]/rivals/route.ts": "write",
    "api/teams/[teamId]/rivals/[rivalId]/route.ts": "write",
    "api/teams/[teamId]/boards/route.ts": "write",
    "api/teams/[teamId]/boards/[boardId]/route.ts": "write",
    "api/friends/route.ts": "friendAdd",
    "api/friends/add/route.ts": "friendAdd",
    "api/friends/code/route.ts": "write",
    "api/friends/[id]/route.ts": "write",
    "api/billing/checkout/route.ts": "billing",
    "api/billing/portal/route.ts": "billing",
    "api/billing/sync/route.ts": "billing",
  };
  const missing = Object.entries(LIMITED)
    .filter(([rel, rule]) => !readFileSync(join(root, rel), "utf8").includes(`rateLimit("${rule}"`))
    .map(([rel]) => rel);
  check(`abusable routes are rate-limited${missing.length ? `: ${missing.join(", ")}` : ""}`, missing.length === 0);
  check("sign-in is rate-limited", /hitRateLimit\("loginEmail"/.test(readFileSync(join(process.cwd(), "src/lib/auth.ts"), "utf8")));

  // ─── Report ──────────────────────────────────────────────
  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${label}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  if (failed) process.exit(1);
}

void main();
