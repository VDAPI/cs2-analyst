/**
 * Regression test for S18 (platform): Premier share codes, Valve replay
 * links, the Steam history walk, PL/EN and notification text.
 * Run: npm run test:platform
 *
 * 1. decodeShareCode() matches a known share code and round-trips with
 *    encodeShareCode(); malformed codes are rejected.
 * 2. parseReplayUrl() accepts only Valve replay servers (no SSRF), and
 *    replayUrlMatchId() ties a link to its share code.
 * 3. fetchNextShareCode() maps Steam's answers (200 / 202 / 412 / 429).
 * 4. PL and EN dictionaries have exactly the same keys; resolveLocale(),
 *    translate() and pluralForm().
 * 5. notificationView() renders "analysis ready / failed" in both languages.
 * 6. isAllowedPushEndpoint() only lets the browsers' push services through.
 *
 * No database, demo file or network needed.
 */
import {
  decodeShareCode,
  encodeShareCode,
  extractShareCode,
  isShareCode,
  parseReplayUrl,
  replayUrlMatchId,
} from "@/lib/steam/share-code";
import { fetchNextShareCode, SteamHistoryError, AUTH_CODE_RE } from "@/lib/steam/match-history";
import { pl } from "@/lib/i18n/messages/pl";
import { en } from "@/lib/i18n/messages/en";
import { resolveLocale } from "@/lib/i18n/config";
import { createT, pluralForm, translate } from "@/lib/i18n/translate";
import { notificationView } from "@/lib/notifications/text";
import { isAllowedPushEndpoint } from "@/lib/notifications/push-endpoint";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keys(v as object, `${prefix}${k}.`)
  );
}

async function main() {
  // ─── 1. Share codes ────────────────────────────────────
  const code = "CSGO-GADqf-jjyJ8-cSP2r-smZRo-TO2xK";
  const d = decodeShareCode(code);
  check("share code → match id", d.matchId === "3230642215713767580");
  check("share code → outcome id", d.outcomeId === "3230647599455273103");
  check("share code → tv port", d.tvPort === 55788);
  check("encode(decode(code)) === code", encodeShareCode(d) === code);

  const synthetic = { matchId: "18446744073709551615", outcomeId: "1", tvPort: 0 };
  check("uint64 max round-trips", decodeShareCode(encodeShareCode(synthetic)).matchId === synthetic.matchId);

  check("rejects bad alphabet (0, l, I)", !isShareCode("CSGO-GADqf-jjyJ8-cSP2r-smZRo-TO2x0"));
  check("rejects wrong group count", !isShareCode("CSGO-GADqf-jjyJ8-cSP2r-smZRo"));
  check("extracts a code from a steam:// link", extractShareCode(`steam://rungame/730/76561202255233023/+csgo_download_match%20${code}`) === code);
  check("extracts a code with whitespace", extractShareCode(`  ${code}\n`) === code);
  check("extract returns null for junk", extractShareCode("hello") === null);
  let threw = false;
  try {
    decodeShareCode("CSGO-xxxxx");
  } catch {
    threw = true;
  }
  check("decode throws on malformed code", threw);

  // ─── 2. Replay links ───────────────────────────────────
  const link = "http://replay183.valve.net/730/003230642215713767580_1094658064.dem.bz2";
  check("accepts a Valve replay link", parseReplayUrl(link) === link);
  check("accepts https", parseReplayUrl(link.replace("http:", "https:")) !== null);
  check("rejects other hosts", parseReplayUrl("http://evil.example/730/1_2.dem.bz2") === null);
  check("rejects look-alike hosts", parseReplayUrl("http://replay1.valve.net.evil.example/730/1_2.dem.bz2") === null);
  check("rejects internal hosts", parseReplayUrl("http://169.254.169.254/730/1_2.dem.bz2") === null);
  check("rejects ports", parseReplayUrl("http://replay1.valve.net:8080/730/1_2.dem.bz2") === null);
  check("rejects credentials", parseReplayUrl("http://a:b@replay1.valve.net/730/1_2.dem.bz2") === null);
  check("rejects other paths", parseReplayUrl("http://replay1.valve.net/730/../etc/passwd") === null);
  check("rejects query strings", parseReplayUrl(`${link}?x=1`) === null);
  check("rejects file://", parseReplayUrl("file:///730/1_2.dem.bz2") === null);
  check("replay link → match id of the share code", replayUrlMatchId(link) === d.matchId);

  // ─── 3. Steam history walk ─────────────────────────────
  const args = { apiKey: "k", steamId: "76561198000000000", authCode: "AAAA-BBBBB-CCCC", knownCode: code };
  const reply = (status: number, body: unknown = {}) => async () => ({ status, json: async () => body });
  const next = "CSGO-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE";
  check("200 → next code", (await fetchNextShareCode(args, reply(200, { result: { nextcode: next } }))) === next);
  check("200 with n/a → null", (await fetchNextShareCode(args, reply(200, { result: { nextcode: "n/a" } }))) === null);
  check("202 → no newer match", (await fetchNextShareCode(args, reply(202))) === null);
  const errorCode = async (status: number) => {
    try {
      await fetchNextShareCode(args, reply(status));
      return "none";
    } catch (err) {
      return err instanceof SteamHistoryError ? err.code : "other";
    }
  };
  check("412 → invalid_auth", (await errorCode(412)) === "invalid_auth");
  check("403 → invalid_auth", (await errorCode(403)) === "invalid_auth");
  check("429 → rate_limited", (await errorCode(429)) === "rate_limited");
  check("500 → steam_error", (await errorCode(500)) === "steam_error");
  let sentUrl = "";
  await fetchNextShareCode(args, async (url) => {
    sentUrl = url;
    return { status: 202, json: async () => ({}) };
  });
  check("request carries steamidkey and knowncode", sentUrl.includes("steamidkey=AAAA-BBBBB-CCCC") && sentUrl.includes(`knowncode=${code}`));
  check("auth code format", AUTH_CODE_RE.test("AB12-CD34E-FG56") && !AUTH_CODE_RE.test("AB12CD34EFG56"));

  // ─── 4. PL / EN ────────────────────────────────────────
  const plKeys = keys(pl).sort();
  const enKeys = keys(en).sort();
  check(`EN has every PL key (${plKeys.length})`, plKeys.every((k) => enKeys.includes(k)));
  check("EN has no extra keys", enKeys.every((k) => plKeys.includes(k)));
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
  const lookup = (o: object, k: string) =>
    k.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], o) as string;
  check(
    "EN keeps the same {placeholders}",
    plKeys.every((k) => placeholders(lookup(pl, k)) === placeholders(lookup(en, k)))
  );
  check("empty strings: none", [...plKeys.map((k) => lookup(pl, k)), ...enKeys.map((k) => lookup(en, k))].every((v) => v.trim().length > 0));

  check("cookie wins", resolveLocale("en", "pl-PL,pl;q=0.9") === "en");
  check("Accept-Language en-US → en", resolveLocale(undefined, "en-US,en;q=0.9") === "en");
  check("Accept-Language with q-values", resolveLocale(undefined, "de;q=0.9,en;q=0.8,pl;q=0.95") === "pl");
  check("unknown language → pl", resolveLocale("de", "de-DE") === "pl");
  check("translate interpolates", translate("en", "upload.statusUploading", { pct: 42 }) === "Uploading 42%");
  check("translate keeps unknown placeholders", translate("pl", "upload.addedOnly", { n: 2 }).includes("{max}"));
  check("plural pl: 1/3/5/12/22", ["one", "few", "many", "many", "few"].join() === [1, 3, 5, 12, 22].map((n) => pluralForm("pl", n)).join());
  check("plural en: 1/3", pluralForm("en", 1) === "one" && pluralForm("en", 3) === "many");

  // ─── 5. Notification text ──────────────────────────────
  const done = notificationView(createT("pl"), {
    type: "ANALYSIS_DONE",
    matchId: "m1",
    data: { map: "de_mirage", score: "13:9" },
  });
  check("done → match link", done.url === "/matches/m1");
  check("done PL title", done.title === "Analiza gotowa");
  check("done body names the map and score", done.body.startsWith("Mirage 13:9"));
  const failed = notificationView(createT("en"), {
    type: "ANALYSIS_FAILED",
    matchId: null,
    data: { fileName: "pug.dem", error: "Corrupt demo" },
  });
  check("failed → queue link", failed.url === "/queue");
  check("failed EN body", failed.title === "Analysis failed" && failed.body === "pug.dem: Corrupt demo");
  const unknown = notificationView(createT("en"), { type: "ANALYSIS_DONE", matchId: null, data: {} });
  check("no map or file → generic label, library link", unknown.body.startsWith("Your match") && unknown.url === "/library");

  // ─── 6. Push endpoints (no SSRF) ───────────────────────
  check("FCM endpoint allowed", isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  check("Mozilla endpoint allowed", isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"));
  check("Windows endpoint allowed", isAllowedPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=abc"));
  check("Apple endpoint allowed", isAllowedPushEndpoint("https://web.push.apple.com/abc"));
  check("internal IP rejected", !isAllowedPushEndpoint("https://10.0.0.5/admin"));
  check("IPv6 literal rejected", !isAllowedPushEndpoint("https://[::1]/x"));
  check("custom port rejected", !isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x"));
  check("http rejected", !isAllowedPushEndpoint("http://fcm.googleapis.com/x"));
  check("credentials rejected", !isAllowedPushEndpoint("https://u:p@fcm.googleapis.com/x"));
  check("lookalike host rejected", !isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x"));
  check("suffix without dot rejected", !isAllowedPushEndpoint("https://evilpush.apple.com/x"));
  check("garbage rejected", !isAllowedPushEndpoint("not a url"));
}

main().then(() => {
  console.log();
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failed++;
  }
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
});
