/**
 * Regression test for S26: Discord bot and the browser extension.
 * Run: npm run test:integrations
 *
 * 1. Link codes (format, typing tolerance, hash) and channel webhook URLs (Discord hosts only).
 * 2. Interaction signatures (Ed25519, stale timestamps, tampering).
 * 3. Slash commands: definitions Discord accepts, the handler on fake data
 *    (not linked, link, stats, last match, PL/EN, errors).
 * 4. Message bodies: stats summary, notification links to the report, no pings.
 * 5. REST client on a fake fetch: DM, webhook, 429 retry, command registration.
 * 6. FACEIT: the stored row of a match from the extension; the room page route exists and needs login.
 * 7. Extension: manifest, files, PL/EN messages, room link parsing and the app link.
 *
 * No database, Redis, Discord or network needed.
 */
import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import {
  formatLinkCode,
  hashLinkCode,
  LINK_CODE_LENGTH,
  maskWebhookUrl,
  newLinkCode,
  normalizeLinkCode,
  normalizeWebhookUrl,
} from "@/lib/discord/link";
import { verifyDiscordSignature } from "@/lib/discord/signature";
import { COMMAND, COMMANDS } from "@/lib/discord/commands";
import {
  handleInteraction,
  interactionLocale,
  INTERACTION_COMMAND,
  INTERACTION_PING,
  RESPONSE_MESSAGE,
  RESPONSE_PONG,
  type DiscordDeps,
  type Interaction,
  type InteractionResponse,
} from "@/lib/discord/handler";
import {
  EPHEMERAL,
  issueTitle,
  notificationMessage,
  summarizeStats,
  type DiscordMessage,
  type LastMatchSummary,
  type StatsMatch,
} from "@/lib/discord/format";
import { executeWebhook, registerCommands, sendDirectMessage, appBaseUrl } from "@/lib/discord/rest";
import { backoffMs, FATAL_CLOSE_CODES } from "@/lib/discord/gateway";
import { faceitMatchRow } from "@/lib/faceit/sync";
import type { FaceitMatchDetail } from "@/lib/faceit/types";
import { RATE_RULES } from "@/lib/security/rate-limit";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

const APP = "https://app.example";

function fakeDeps(over: Partial<DiscordDeps> = {}): DiscordDeps & { calls: string[] } {
  const calls: string[] = [];
  const linked = new Map<string, { userId: string; locale: string }>([["111", { userId: "u1", locale: "pl" }]]);
  const goodHash = hashLinkCode("ABCDEFGH");
  return {
    calls,
    appUrl: APP,
    async findLinked(id) {
      return linked.get(id) ?? null;
    },
    async linkByCode(hash, id) {
      calls.push(`link:${id}`);
      if (hash !== goodHash) return null;
      linked.set(id, { userId: "u2", locale: "en" });
      return { name: "Gracz" };
    },
    async unlink(id) {
      return linked.delete(id);
    },
    async loadStats(userId, n) {
      calls.push(`stats:${userId}:${n}`);
      return summarizeStats("Gracz", MATCHES.slice(0, n));
    },
    async loadLastMatch(userId) {
      calls.push(`last:${userId}`);
      return LAST;
    },
    ...over,
  };
}

const MATCHES: StatsMatch[] = [
  { map: "de_mirage", date: "2026-10-10T18:00:00Z", result: "W", kills: 24, deaths: 15, assists: 4, adr: 92, hsPercent: 50, hltvRating: 1.3 },
  { map: "de_mirage", date: "2026-10-09T18:00:00Z", result: "W", kills: 20, deaths: 18, assists: 6, adr: 80, hsPercent: 45, hltvRating: 1.1 },
  { map: "de_inferno", date: "2026-10-08T18:00:00Z", result: "L", kills: 12, deaths: 20, assists: 2, adr: 60, hsPercent: 30, hltvRating: 0.7 },
  { map: "de_inferno", date: "2026-10-07T18:00:00Z", result: "D", kills: 16, deaths: 16, assists: 3, adr: 75, hsPercent: 40, hltvRating: 1.0 },
];

const LAST: LastMatchSummary = {
  matchId: "m42",
  map: "de_mirage",
  date: "2026-10-10T18:00:00Z",
  name: "Gracz",
  ownScore: 13,
  enemyScore: 9,
  result: "W",
  kills: 24,
  deaths: 15,
  assists: 4,
  adr: 92.4,
  hsPercent: 50,
  hltvRating: 1.31,
  topIssues: ["moving_shot", "untraded_death"],
};

function command(name: string, opts: Interaction["data"] extends infer D ? Partial<NonNullable<D>> : never = {}, extra: Partial<Interaction> = {}): Interaction {
  return {
    id: "i1",
    type: INTERACTION_COMMAND,
    token: "tok",
    locale: "pl",
    data: { name, ...opts },
    member: { user: { id: "111", username: "gracz" } },
    ...extra,
  };
}

const msg = (r: InteractionResponse): DiscordMessage => (r.type === RESPONSE_MESSAGE ? r.data : {});
const text = (r: InteractionResponse) => JSON.stringify(msg(r));

async function main() {
  // ─── 1. Link codes and webhooks ──────────────────────────
  const code = newLinkCode();
  check("link code has 8 unambiguous characters", code.length === LINK_CODE_LENGTH && !/[01OIL]/.test(code));
  check("typed code: lowercase and dash accepted", normalizeLinkCode(formatLinkCode(code).toLowerCase()) === code);
  check("code with O/0 refused", normalizeLinkCode("ABCD0FGH") === null && normalizeLinkCode("ABCDOFGH") === null);
  check("wrong length refused", normalizeLinkCode("ABC") === null && normalizeLinkCode(null) === null);
  check("hash is stable and not the code", hashLinkCode(code) === hashLinkCode(code) && !hashLinkCode(code).includes(code));
  check("two codes differ", newLinkCode() !== newLinkCode() || newLinkCode() !== newLinkCode());

  const hook = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-ABCDEFG";
  check("webhook accepted", normalizeWebhookUrl(hook) === hook);
  check("discordapp.com + api version normalised", normalizeWebhookUrl(hook.replace("discord.com/api/", "discordapp.com/api/v10/")) === hook);
  check("ptb host accepted", normalizeWebhookUrl(hook.replace("discord.com", "ptb.discord.com")) === hook);
  for (const bad of [
    hook.replace("https:", "http:"),
    hook.replace("discord.com", "discord.com.evil.example"),
    hook.replace("discord.com", "evil.example"),
    hook.replace("https://", "https://user:pw@"),
    hook.replace("discord.com", "discord.com:8443"),
    "https://discord.com/api/channels/123/messages",
    "not a url",
    "",
  ]) {
    check(`webhook refused: ${bad.slice(0, 50) || "(empty)"}`, normalizeWebhookUrl(bad) === null);
  }
  check("masked webhook hides the token", !maskWebhookUrl(hook).includes("abcdefghij") && maskWebhookUrl(hook).includes("123456789012345678"));

  // ─── 2. Signatures ───────────────────────────────────────
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubHex = (publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(12).toString("hex");
  const now = 1_760_000_000;
  const body = JSON.stringify({ type: 1 });
  const sig = (ts: string, b: string) => sign(null, Buffer.from(ts + b), privateKey).toString("hex");
  const good = { publicKeyHex: pubHex, signature: sig(String(now), body), timestamp: String(now), body, nowSeconds: now };
  check("valid signature passes", verifyDiscordSignature(good));
  check("tampered body fails", !verifyDiscordSignature({ ...good, body: JSON.stringify({ type: 2 }) }));
  check("other timestamp fails", !verifyDiscordSignature({ ...good, timestamp: String(now + 1) }));
  check("stale request fails", !verifyDiscordSignature({ ...good, nowSeconds: now + 3600 }));
  check("missing headers fail", !verifyDiscordSignature({ ...good, signature: null }) && !verifyDiscordSignature({ ...good, timestamp: null }));
  check("no key configured fails", !verifyDiscordSignature({ ...good, publicKeyHex: undefined }));
  check("malformed key fails", !verifyDiscordSignature({ ...good, publicKeyHex: "zz" }));
  const other = generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }) as Buffer;
  check("another app's key fails", !verifyDiscordSignature({ ...good, publicKeyHex: other.subarray(12).toString("hex") }));

  // ─── 3. Commands and the handler ─────────────────────────
  const NAME = /^[-_\p{Ll}\p{N}]{1,32}$/u;
  const names = COMMANDS.flatMap((c) => [c.name, ...Object.values(c.name_localizations ?? {}), ...(c.options ?? []).flatMap((o) => [o.name, ...Object.values(o.name_localizations ?? {})])]);
  check("command and option names are valid for Discord", names.every((n) => NAME.test(n)));
  const descs = COMMANDS.flatMap((c) => [c.description, ...Object.values(c.description_localizations ?? {}), ...(c.options ?? []).flatMap((o) => [o.description, ...Object.values(o.description_localizations ?? {})])]);
  check("descriptions 1–100 characters", descs.every((d) => d.length >= 1 && d.length <= 100));
  check("every command has an English name or description", COMMANDS.every((c) => c.description_localizations?.["en-US"]));
  check("spec commands exist: /stats, /ostatni-mecz", COMMANDS.some((c) => c.name === "stats") && COMMANDS.some((c) => c.name === "ostatni-mecz"));

  const ping = await handleInteraction({ id: "p", type: INTERACTION_PING, token: "t" }, fakeDeps());
  check("PING → PONG", ping.type === RESPONSE_PONG);

  const deps = fakeDeps();
  const notLinked = await handleInteraction(command(COMMAND.stats, {}, { member: { user: { id: "999", username: "x" } } }), deps);
  check("/stats when not linked explains how to link", text(notLinked).includes("/polacz") && text(notLinked).includes(`${APP}/settings#discord`));
  check("replies are ephemeral", msg(notLinked).flags === EPHEMERAL);
  const notLinkedEn = await handleInteraction(command(COMMAND.stats, {}, { locale: "en-US", member: { user: { id: "999", username: "x" } } }), deps);
  check("…in English for an English client", text(notLinkedEn).includes("isn't linked"));

  const bad = await handleInteraction(command(COMMAND.link, { options: [{ name: "kod", type: 3, value: "ZZZZ-ZZZZ" }] }, { member: { user: { id: "222", username: "n" } } }), deps);
  check("wrong code → invalid", text(bad).includes("wygasł"));
  const malformed = await handleInteraction(command(COMMAND.link, { options: [{ name: "kod", type: 3, value: "x" }] }, { member: { user: { id: "222", username: "n" } } }), deps);
  check("malformed code never reaches the database", text(malformed).includes("wygasł") && deps.calls.filter((c) => c === "link:222").length === 1);
  const ok = await handleInteraction(command(COMMAND.link, { options: [{ name: "kod", type: 3, value: "abcd-efgh" }] }, { user: { id: "222", username: "n" }, member: undefined }), deps);
  check("right code links (DM context, account language)", text(ok).includes("Linked to the CS2 Analyst account Gracz"));
  const nowLinked = await deps.findLinked("222");
  check("…and the account is linked", nowLinked?.userId === "u2");

  const stats = await handleInteraction(command(COMMAND.stats, { options: [{ name: "mecze", type: 4, value: 3 }] }), deps);
  const embed = msg(stats).embeds?.[0];
  check("/stats asks for the requested number of matches", deps.calls.includes("stats:u1:3"));
  check("/stats embed: title, record, link to progress", !!embed?.title?.includes("Gracz") && embed.url === `${APP}/progress` && JSON.stringify(embed.fields).includes("2-1-0"));
  await handleInteraction(command(COMMAND.stats, { options: [{ name: "mecze", type: 4, value: 500 }] }), deps);
  check("/stats caps the match count", deps.calls.includes("stats:u1:50"));

  const last = await handleInteraction(command(COMMAND.lastMatch), deps);
  const lastEmbed = msg(last).embeds?.[0];
  check("/ostatni-mecz links the report", lastEmbed?.url === `${APP}/report/m42` && JSON.stringify(lastEmbed).includes(`(${APP}/report/m42)`));
  check("/ostatni-mecz: map, score, result, top issues", !!lastEmbed?.title?.includes("Mirage") && lastEmbed.title.includes("13:9") && lastEmbed.title.includes("Wygrana") && JSON.stringify(lastEmbed.fields).includes("1. Strzelasz w ruchu"));
  check("English issue titles come from the English catalog", issueTitle("moving_shot", "en") === "You shoot while moving");

  const empty = await handleInteraction(command(COMMAND.lastMatch), fakeDeps({ loadLastMatch: async () => null }));
  check("no matches → upload link", text(empty).includes(`${APP}/upload`));
  const broken = await handleInteraction(command(COMMAND.stats), fakeDeps({ loadStats: async () => { throw new Error("db down"); } }));
  check("a failing query answers with an error, not a timeout", text(broken).includes("Coś poszło nie tak"));
  const unknown = await handleInteraction(command("cokolwiek"), deps);
  check("unknown command answered", text(unknown).includes("Nie znam"));
  const unlinked = await handleInteraction(command(COMMAND.unlink), deps);
  check("/rozlacz unlinks", text(unlinked).includes("Odłączono") && (await deps.findLinked("111")) === null);
  check("locale: account first, then client", interactionLocale({ locale: "en-US" }, { userId: "u", locale: "pl" }) === "pl" && interactionLocale({ locale: "pl" }) === "pl" && interactionLocale({ locale: "de" }) === "en");
  check("/polacz attempts are rate-limited per Discord account", RATE_RULES.discordLink.max <= 20);

  // ─── 4. Message bodies ───────────────────────────────────
  const s = summarizeStats("Gracz", MATCHES)!;
  check("summary: record and K/D", s.wins === 2 && s.losses === 1 && s.draws === 1 && Math.abs(s.kd - 72 / 69) < 1e-9);
  check("summary: best map needs 2 matches and wins", s.bestMap?.map === "de_mirage" && s.bestMap.wins === 2);
  check("summary: one match → no best map", summarizeStats("x", MATCHES.slice(0, 1))?.bestMap === null);
  check("summary: none → null", summarizeStats("x", []) === null);

  const done = notificationMessage("pl", { type: "ANALYSIS_DONE", matchId: "m1", data: { map: "de_mirage", score: "13:9" } }, `${APP}/`);
  check("notification links the report", done.embeds?.[0].url === `${APP}/report/m1` && !!done.embeds?.[0].description?.includes("Mirage 13:9"));
  check("notification never pings", JSON.stringify(done.allowed_mentions) === JSON.stringify({ parse: [] }));
  const failed = notificationMessage("en", { type: "ANALYSIS_FAILED", matchId: null, data: { fileName: "x.dem", error: "@everyone boom" } }, APP);
  check("failed notification links the queue, in English", failed.embeds?.[0].url === `${APP}/queue` && failed.embeds?.[0].title === "Analysis failed");
  check("app URL falls back to NEXTAUTH_URL", appBaseUrl({ NEXTAUTH_URL: "https://x.example/" } as NodeJS.ProcessEnv) === "https://x.example");

  // ─── 5. REST client ──────────────────────────────────────
  const requests: Array<{ url: string; method: string; auth: string | null; body: unknown }> = [];
  let rateLimitOnce = true;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    requests.push({ url, method: init?.method ?? "GET", auth: headers.Authorization ?? null, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.endsWith("/users/@me/channels")) return new Response(JSON.stringify({ id: "dm1" }), { status: 200 });
    if (url.includes("/webhooks/") && rateLimitOnce) {
      rateLimitOnce = false;
      return new Response(JSON.stringify({ retry_after: 0.01 }), { status: 429 });
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  await sendDirectMessage("bot-token", "111", done, fakeFetch);
  check("DM: opens the channel, then posts, with the bot token", requests[0].url.endsWith("/users/@me/channels") && requests[1].url.endsWith("/channels/dm1/messages") && requests[1].auth === "Bot bot-token");
  requests.length = 0;
  await executeWebhook(hook, { ...done, flags: EPHEMERAL }, fakeFetch);
  const posted = requests[requests.length - 1];
  check("webhook: retried after 429, no bot token, no flags", requests.length === 2 && posted.auth === null && !(posted.body as Record<string, unknown>).flags);
  requests.length = 0;
  await registerCommands("bot-token", "app1", COMMANDS, fakeFetch);
  check("commands registered with one bulk PUT", requests.length === 1 && requests[0].method === "PUT" && requests[0].url.endsWith("/applications/app1/commands"));
  check("gateway: backoff grows and caps, bad token is fatal", backoffMs(0) === 1000 && backoffMs(3) === 8000 && backoffMs(20) === 60_000 && FATAL_CLOSE_CODES.has(4004));

  // ─── 6. FACEIT ───────────────────────────────────────────
  const details = {
    match_id: "1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    status: "FINISHED",
    finished_at: 1_760_000_000,
    competition_name: "5v5 RANKED",
    faceit_url: "https://www.faceit.com/{lang}/cs2/room/1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    demo_url: ["https://demos.example/x.dem.zst"],
    results: { winner: "faction2", score: { faction1: 9, faction2: 13 } },
    teams: {
      faction1: { roster: [{ player_id: "other" }] },
      faction2: { roster: [{ player_id: "me" }] },
    },
    voting: { map: { pick: ["de_mirage"] } },
  } as unknown as FaceitMatchDetail;
  const row = faceitMatchRow(details, "me");
  check("extension match row: map, score, result, url", row.map === "de_mirage" && row.score === "9-13" && row.result === "WIN" && row.faceitUrl.includes("/en/cs2/room/"));
  check("extension match row: demo resource kept, nothing downloaded", row.demoStatus === "AVAILABLE" && row.date.getTime() === 1_760_000_000_000);
  const root = process.cwd();
  check("room page exists", existsSync(join(root, "src/app/(dashboard)/faceit/room/[matchId]/page.tsx")));
  check("room page needs login (middleware)", readFileSync(join(root, "src/middleware.ts"), "utf8").includes('"/faceit/:path*"'));
  const roomPage = readFileSync(join(root, "src/app/(dashboard)/faceit/room/[matchId]/page.tsx"), "utf8");
  check("room page never queues a download", !/enqueue|faceitDemoDownload|\/download/.test(roomPage));

  // ─── 7. Extension ────────────────────────────────────────
  const ext = join(root, "extension");
  const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
  check("manifest v3", manifest.manifest_version === 3);
  check("only the storage permission, no host permissions", JSON.stringify(manifest.permissions) === '["storage"]' && !manifest.host_permissions);
  check("content script only on faceit.com", JSON.stringify(manifest.content_scripts[0].matches) === '["https://www.faceit.com/*"]');
  check("Firefox id set", !!manifest.browser_specific_settings?.gecko?.id);
  const referenced: string[] = [
    ...Object.values(manifest.icons as Record<string, string>),
    ...manifest.content_scripts.flatMap((c: { js: string[]; css: string[] }) => [...c.js, ...c.css]),
    manifest.options_ui.page,
    ...manifest.web_accessible_resources.flatMap((w: { resources: string[] }) => w.resources),
  ];
  const missing = referenced.filter((f) => !existsSync(join(ext, f)));
  check(`every file in the manifest exists${missing.length ? `: ${missing.join(", ")}` : ""}`, missing.length === 0);

  const pl = JSON.parse(readFileSync(join(ext, "_locales/pl/messages.json"), "utf8")) as Record<string, { message: string }>;
  const en = JSON.parse(readFileSync(join(ext, "_locales/en/messages.json"), "utf8")) as Record<string, { message: string }>;
  check("PL and EN messages have the same keys", JSON.stringify(Object.keys(pl).sort()) === JSON.stringify(Object.keys(en).sort()));
  const sources = ["manifest.json", "content.js", "options.html", "options.js"].map((f) => readFileSync(join(ext, f), "utf8")).join("\n");
  const used = new Set([
    ...[...sources.matchAll(/__MSG_(\w+)__/g)].map((m) => m[1]),
    ...[...sources.matchAll(/data-i18n="(\w+)"/g)].map((m) => m[1]),
    ...[...sources.matchAll(/getMessage\("(\w+)"/g)].map((m) => m[1]),
    ...[...sources.matchAll(/message\("(\w+)"/g)].map((m) => m[1]),
  ]);
  const undefinedKeys = [...used].filter((k) => !pl[k]);
  check(`every message used is defined${undefinedKeys.length ? `: ${undefinedKeys.join(", ")}` : ""}`, used.size > 5 && undefinedKeys.length === 0);
  check("extension name ≤ 45 characters (Chrome / Firefox limit)", pl.extName.message.length <= 45 && en.extName.message.length <= 45);
  check("description ≤ 132 characters (Chrome limit)", pl.extDescription.message.length <= 132 && en.extDescription.message.length <= 132);

  const sandbox: { CS2A?: { roomMatchId(h: string): string | null; analyzeUrl(a: string, id: string): string; normalizeAppUrl(u: string): string | null; DEFAULT_APP_URL: string } } & Record<string, unknown> = { URL };
  vm.runInNewContext(readFileSync(join(ext, "lib/room.js"), "utf8"), sandbox);
  const cs2a = sandbox.CS2A!;
  const id = "1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  check("room link → match id", cs2a.roomMatchId(`https://www.faceit.com/pl/cs2/room/${id}`) === id);
  check("room link with /scoreboard and query", cs2a.roomMatchId(`https://www.faceit.com/en/cs2/room/${id.toUpperCase()}/scoreboard?x=1`) === id);
  check("room link without language", cs2a.roomMatchId(`https://www.faceit.com/cs2/room/${id}`) === id);
  check("not a room: profile, other host, other game", [
    "https://www.faceit.com/pl/players/someone",
    `https://evil.example/pl/cs2/room/${id}`,
    `https://www.faceit.com/pl/csgo/room/${id}`,
    `http://www.faceit.com/pl/cs2/room/${id}`,
  ].every((h) => cs2a.roomMatchId(h) === null));
  check("button opens the app's room page", cs2a.analyzeUrl("http://localhost:3000/", id) === `http://localhost:3000/faceit/room/${id}`);
  check("app address with a path kept", cs2a.analyzeUrl("https://cs2.example/app", id) === `https://cs2.example/app/faceit/room/${id}`);
  check("bad app address falls back to localhost", cs2a.analyzeUrl("javascript:alert(1)", id) === `${cs2a.DEFAULT_APP_URL}/faceit/room/${id}`);
  check("app address must be http(s)", cs2a.normalizeAppUrl("ftp://x") === null && cs2a.normalizeAppUrl("https://u:p@x.example") === null);

  // ─── Report ──────────────────────────────────────────────
  let failedCount = 0;
  for (const [label, okay] of checks) {
    if (!okay) failedCount++;
    console.log(`${okay ? "✓" : "✗"} ${label}`);
  }
  console.log(`\n${checks.length - failedCount}/${checks.length} checks passed`);
  if (failedCount) process.exit(1);
}

void main();
