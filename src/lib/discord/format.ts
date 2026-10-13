/**
 * Discord message bodies (S26): embeds for /stats, /ostatni-mecz and the
 * "analysis ready" notification. Pure: data in, JSON for the Discord API out,
 * text through the PL/EN dictionary.
 */
import type { Locale } from "@/lib/i18n/config";
import { createT, type TFunction } from "@/lib/i18n/translate";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { formatDate } from "@/lib/utils/formatters";
import { FINDING_TYPES, type FindingType } from "@/lib/findings/catalog";
import { FINDING_TYPES_EN } from "@/lib/coach/catalog-en";
import { notificationView, type NotificationKind, type NotificationData } from "@/lib/notifications/text";

/** Embed colours: the Violet Lime tokens as integers (Discord can't read CSS). */
export const EMBED_COLOR = {
  accent: 0x9b6bff,
  lime: 0xc6ff3d,
  mistake: 0xff4d6a,
} as const;

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  /** 64 = only the person who ran the command sees it. */
  flags?: number;
  allowed_mentions?: { parse: string[] };
}

export const EPHEMERAL = 64;

export type MatchResultCode = "W" | "L" | "D";

/** One match of the player, as /stats needs it. */
export interface StatsMatch {
  map: string;
  date: string; // ISO
  result: MatchResultCode;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  hsPercent: number;
  hltvRating: number;
}

export interface StatsSummary {
  name: string;
  count: number;
  wins: number;
  losses: number;
  draws: number;
  kd: number;
  adr: number;
  hsPercent: number;
  rating: number;
  bestMap: { map: string; matches: number; wins: number } | null;
  from: string;
  to: string;
}

/** Averages over the matches (newest first or any order). Null when there are none. */
export function summarizeStats(name: string, matches: StatsMatch[]): StatsSummary | null {
  if (matches.length === 0) return null;
  const n = matches.length;
  const sum = (f: (m: StatsMatch) => number) => matches.reduce((s, m) => s + f(m), 0);
  const kills = sum((m) => m.kills);
  const deaths = sum((m) => m.deaths);

  const byMap = new Map<string, { matches: number; wins: number; rating: number }>();
  for (const m of matches) {
    const e = byMap.get(m.map) ?? { matches: 0, wins: 0, rating: 0 };
    e.matches++;
    if (m.result === "W") e.wins++;
    e.rating += m.hltvRating;
    byMap.set(m.map, e);
  }
  // Best map: at least 2 matches there, then win rate, then rating.
  let bestMap: StatsSummary["bestMap"] = null;
  let bestKey = -Infinity;
  for (const [map, e] of byMap) {
    if (e.matches < 2) continue;
    const key = e.wins / e.matches + e.rating / e.matches / 100;
    if (key > bestKey) {
      bestKey = key;
      bestMap = { map, matches: e.matches, wins: e.wins };
    }
  }

  const dates = matches.map((m) => m.date).sort();
  return {
    name,
    count: n,
    wins: matches.filter((m) => m.result === "W").length,
    losses: matches.filter((m) => m.result === "L").length,
    draws: matches.filter((m) => m.result === "D").length,
    kd: deaths > 0 ? kills / deaths : kills,
    adr: sum((m) => m.adr) / n,
    hsPercent: sum((m) => m.hsPercent) / n,
    rating: sum((m) => m.hltvRating) / n,
    bestMap,
    from: dates[0],
    to: dates[dates.length - 1],
  };
}

export interface LastMatchSummary {
  matchId: string;
  map: string;
  date: string;
  name: string;
  ownScore: number;
  enemyScore: number;
  result: MatchResultCode;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  hsPercent: number;
  hltvRating: number;
  /** Finding types of the report's top issues, best first. */
  topIssues: string[];
}

export function issueTitle(type: string, locale: Locale): string {
  if (locale === "en" && type in FINDING_TYPES_EN) return FINDING_TYPES_EN[type as FindingType].title;
  return type in FINDING_TYPES ? FINDING_TYPES[type as FindingType].title : type;
}

const fixed = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : "–");
const absolute = (appUrl: string, path: string) => `${appUrl.replace(/\/+$/, "")}${path}`;
const resultKey = { W: "discord.resultW", L: "discord.resultL", D: "discord.resultD" } as const;
const resultColor = { W: EMBED_COLOR.lime, L: EMBED_COLOR.mistake, D: EMBED_COLOR.accent } as const;

export function statsMessage(locale: Locale, s: StatsSummary, appUrl: string): DiscordMessage {
  const t = createT(locale);
  const fields: DiscordEmbed["fields"] = [
    { name: t("discord.record"), value: `${s.wins}-${s.losses}-${s.draws}`, inline: true },
    { name: t("discord.rating"), value: fixed(s.rating, 2), inline: true },
    { name: t("discord.kd"), value: fixed(s.kd, 2), inline: true },
    { name: "ADR", value: fixed(s.adr, 1), inline: true },
    { name: "HS%", value: `${fixed(s.hsPercent, 0)}%`, inline: true },
  ];
  if (s.bestMap) {
    fields.push({
      name: t("discord.bestMap"),
      value: t("discord.bestMapValue", { map: mapDisplayName(s.bestMap.map), wins: s.bestMap.wins, matches: s.bestMap.matches }),
      inline: true,
    });
  }
  return {
    flags: EPHEMERAL,
    embeds: [
      {
        title: t("discord.statsTitle", { name: s.name }),
        url: absolute(appUrl, "/progress"),
        description: t("discord.statsDescription", { count: s.count, from: formatDate(s.from), to: formatDate(s.to) }),
        color: EMBED_COLOR.accent,
        fields,
        footer: { text: "CS2 Analyst" },
      },
    ],
  };
}

export function lastMatchMessage(locale: Locale, m: LastMatchSummary, appUrl: string): DiscordMessage {
  const t = createT(locale);
  const reportUrl = absolute(appUrl, `/report/${m.matchId}`);
  const improve = m.topIssues.length
    ? m.topIssues.map((type, i) => `${i + 1}. ${issueTitle(type, locale)}`).join("\n")
    : t("discord.improveNone");
  return {
    flags: EPHEMERAL,
    embeds: [
      {
        title: t("discord.lastTitle", {
          map: mapDisplayName(m.map),
          score: `${m.ownScore}:${m.enemyScore}`,
          result: t(resultKey[m.result]),
        }),
        url: reportUrl,
        description: `${m.name} · ${formatDate(m.date)}`,
        color: resultColor[m.result],
        fields: [
          { name: "K-D-A", value: `${m.kills}-${m.deaths}-${m.assists}`, inline: true },
          { name: t("discord.rating"), value: fixed(m.hltvRating, 2), inline: true },
          { name: "ADR", value: fixed(m.adr, 1), inline: true },
          { name: "HS%", value: `${fixed(m.hsPercent, 0)}%`, inline: true },
          { name: t("discord.improve"), value: improve },
          { name: t("discord.report"), value: `[${t("discord.openReport")}](${reportUrl})` },
        ],
        footer: { text: "CS2 Analyst" },
      },
    ],
  };
}

/** "Analysis ready / failed": the same text as the bell and push, linking to the report. */
export function notificationMessage(
  locale: Locale,
  n: { type: NotificationKind; matchId: string | null; data: NotificationData },
  appUrl: string
): DiscordMessage {
  const t: TFunction = createT(locale);
  const view = notificationView(t, n);
  const done = n.type === "ANALYSIS_DONE";
  const url = absolute(appUrl, done && n.matchId ? `/report/${n.matchId}` : view.url);
  return {
    // Webhooks post into a channel: never ping anyone from player-supplied text.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: view.title,
        url,
        description: `${view.body}\n[${done ? t("discord.openReport") : t("discord.openQueue")}](${url})`,
        color: done ? EMBED_COLOR.lime : EMBED_COLOR.mistake,
        footer: { text: "CS2 Analyst" },
      },
    ],
  };
}

/** A plain ephemeral reply. */
export function textMessage(content: string): DiscordMessage {
  return { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } };
}
