/**
 * Regression test for S27: admin panel. Run: npm run test:admin
 *
 * 1. isAdminUser(): DB role and the dev login (development only); ADMIN_EMAILS
 *    never grants admin at runtime (it only feeds `npm run admin:grant`).
 *    Email normalization and the Steam pseudo-domain rule used by register/login.
 * 2. dailyCounts(): one row per Warsaw calendar day, DST-safe, statuses bucketed.
 * 3. percentile() / parseTimeSummary() for parse times.
 * 4. isStuck(): only in-flight analyses untouched for STUCK_AFTER_MS.
 * 5. effectiveMonthlyLimit(): the admin override wins over the plan default.
 * 6. sentryTracesSampleRate() clamps bad env values.
 *
 * No database, Redis or network needed.
 */
import { DEV_ADMIN_EMAIL, isAdminUser, parseAdminEmails } from "@/lib/admin/access";
import { isSteamPseudoEmail, normalizeEmail } from "@/lib/email";
import {
  dailyCounts,
  dayKey,
  formatDuration,
  isStuck,
  parseTimeSummary,
  percentile,
  STUCK_AFTER_MS,
} from "@/lib/admin/metrics";
import { effectiveMonthlyLimit, PLAN_LIMITS } from "@/lib/limits";
import { sentryTracesSampleRate } from "@/lib/monitoring/sentry-options";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// ─── 1. Admin access ─────────────────────────────────────
const prod = { NODE_ENV: "production", ADMIN_EMAILS: " Owner@Example.com , ops@example.com,," };
check("role ADMIN is admin", isAdminUser({ role: "ADMIN", email: null }, {}));
check("plain user is not admin", !isAdminUser({ role: "USER", email: "a@b.c" }, prod));
// Unverified emails: being on ADMIN_EMAILS must not be enough (anyone can register the address).
check("ADMIN_EMAILS address alone is not admin", !isAdminUser({ role: "USER", email: "owner@example.com" }, prod));
check("ADMIN_EMAILS case variant is not admin", !isAdminUser({ role: "USER", email: "OPS@example.com" }, prod));
check("ADMIN_EMAILS parses trimmed + lowercase", parseAdminEmails(prod.ADMIN_EMAILS).join() === "owner@example.com,ops@example.com");
check("no email, no admin", !isAdminUser({ role: "USER", email: null }, prod));
check("null user is not admin", !isAdminUser(null, prod));
check("dev login is admin in development", isAdminUser({ role: "USER", email: DEV_ADMIN_EMAIL }, { NODE_ENV: "development" }));
check("dev login is NOT admin in production", !isAdminUser({ role: "USER", email: DEV_ADMIN_EMAIL }, { NODE_ENV: "production" }));
check("dev login case variant is not admin", !isAdminUser({ role: "USER", email: "Dev@cs2analyst.local" }, { NODE_ENV: "development" }));
check("normalizeEmail trims + lowercases", normalizeEmail("  Admin@Site.COM ") === "admin@site.com");
check("Steam pseudo email is reserved", isSteamPseudoEmail("76561198000000000@SteamCommunity.com"));
check("Steam subdomain is reserved", isSteamPseudoEmail("x@foo.steamcommunity.com"));
check("lookalike domain is not reserved", !isSteamPseudoEmail("x@notsteamcommunity.com"));
check("empty ADMIN_EMAILS parses to []", parseAdminEmails("") .length === 0 && parseAdminEmails(undefined).length === 0);

// ─── 2. Daily counts ─────────────────────────────────────
const now = new Date("2026-10-12T10:00:00Z"); // 12:00 in Warsaw
const rows = dailyCounts(
  [
    { createdAt: new Date("2026-10-12T08:00:00Z"), status: "COMPLETED" },
    { createdAt: new Date("2026-10-12T09:00:00Z"), status: "FAILED" },
    { createdAt: new Date("2026-10-12T09:30:00Z"), status: "PARSING" },
    // 23:30 UTC on the 11th is 01:30 on the 12th in Warsaw (CEST, UTC+2)
    { createdAt: new Date("2026-10-11T23:30:00Z"), status: "COMPLETED" },
    { createdAt: new Date("2026-10-11T12:00:00Z"), status: "QUEUED" },
    { createdAt: new Date("2026-08-01T12:00:00Z"), status: "COMPLETED" }, // out of range
  ],
  30,
  now
);
const today = rows[rows.length - 1];
const yesterday = rows[rows.length - 2];
check("30 rows", rows.length === 30);
check("last row is today", today.day === "2026-10-12");
check("first row is 29 days back", rows[0].day === "2026-09-13");
check("today: 2 completed (incl. Warsaw-midnight one)", today.completed === 2);
check("today: 1 failed, 1 pending", today.failed === 1 && today.pending === 1);
check("yesterday: 1 pending", yesterday.pending === 1 && yesterday.completed === 0);
check("out-of-range upload ignored", rows.reduce((s, r) => s + r.completed + r.failed + r.pending, 0) === 5);
// Spring-forward day (2027-03-28 has 23h in Warsaw) must not be skipped.
const dst = dailyCounts([], 3, new Date("2027-03-29T00:30:00+02:00"));
check("DST: no skipped day", dst.map((r) => r.day).join() === "2027-03-27,2027-03-28,2027-03-29");
const unique = new Set(rows.map((r) => r.day));
check("no duplicate days", unique.size === rows.length);
check("dayKey uses Warsaw time", dayKey(new Date("2026-10-11T22:30:00Z")) === "2026-10-12");

// ─── 3. Parse times ──────────────────────────────────────
check("percentile empty → null", percentile([], 50) === null);
check("p50 of 1..10 is 5", percentile([10, 1, 2, 3, 4, 5, 6, 7, 8, 9], 50) === 5);
check("p95 of 1..20 is 19", percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95) === 19);
check("p100 is max", percentile([3, 9, 1], 100) === 9);
const summary = parseTimeSummary([30_000, 40_000, 50_000, Number.NaN, -5]);
check("summary skips invalid values", summary.count === 3);
check("summary avg", summary.avgMs === 40_000);
check("summary p50 / max", summary.p50Ms === 40_000 && summary.maxMs === 50_000);
check("empty summary", parseTimeSummary([]).avgMs === null);
check("formatDuration short", formatDuration(1_234) === "1,2 s");
check("formatDuration seconds", formatDuration(48_000) === "48 s");
check("formatDuration minutes", formatDuration(125_000) === "2 min 05 s");
check("formatDuration null", formatDuration(null) === "—");

// ─── 4. Stuck analyses ───────────────────────────────────
const old = new Date(now.getTime() - STUCK_AFTER_MS - 1000);
const fresh = new Date(now.getTime() - 60_000);
check("old PARSING is stuck", isStuck({ status: "PARSING", updatedAt: old }, now));
check("old QUEUED is stuck", isStuck({ status: "QUEUED", updatedAt: old }, now));
check("old DOWNLOADING is stuck", isStuck({ status: "DOWNLOADING", updatedAt: old }, now));
check("fresh PARSING is not stuck", !isStuck({ status: "PARSING", updatedAt: fresh }, now));
check("old FAILED is not stuck", !isStuck({ status: "FAILED", updatedAt: old }, now));
check("old COMPLETED is not stuck", !isStuck({ status: "COMPLETED", updatedAt: old }, now));

// ─── 5. Limit override ───────────────────────────────────
check("no override → plan default", effectiveMonthlyLimit("FREE", null) === PLAN_LIMITS.FREE.monthlyDemos);
check("override wins", effectiveMonthlyLimit("FREE", 42) === 42);
check("override 0 blocks uploads", effectiveMonthlyLimit("PRO", 0) === 0);
check("override caps unlimited TEAM", effectiveMonthlyLimit("TEAM", 5) === 5);
check("TEAM default unlimited", !Number.isFinite(effectiveMonthlyLimit("TEAM", null)));

// ─── 6. Sentry sample rate ───────────────────────────────
check("default sample rate", sentryTracesSampleRate(undefined) === 0.1);
check("valid sample rate", sentryTracesSampleRate("0.5") === 0.5);
check("clamped above 1", sentryTracesSampleRate("7") === 1);
check("garbage falls back", sentryTracesSampleRate("abc") === 0.1);

// ─── Report ──────────────────────────────────────────────
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed > 0) process.exit(1);
