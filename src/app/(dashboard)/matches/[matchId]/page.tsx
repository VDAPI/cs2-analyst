import { prisma } from "@/lib/db/prisma";
import { ownMatchWhere } from "@/lib/sharing/access";
import { notFound } from "next/navigation";
import { Card, PageHeader, buttonVariants } from "@/components/ui";
import { MapThumb } from "@/components/match";
import Link from "next/link";
import { ClipboardCheck, Crosshair, DollarSign, Flame, Footprints, Play, Clapperboard, Users } from "lucide-react";
import { RoundTimeline } from "./round-timeline";
import { ScoreboardLegend, ScoreboardTable } from "./scoreboard-table";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { detectMultiKills, multiKillsByRound } from "@/lib/utils/multiKills";
import { detectTradeKills } from "@/lib/utils/tradeKills";
import { detectClutchesBySide } from "@/lib/utils/clutches";
import { createSideResolver } from "@/lib/utils/sideSplit";

interface Props {
  params: Promise<{ matchId: string }>;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function MatchDetailPage({ params }: Props) {
  const { matchId } = await params;

  // The uploader's own match (admins may open any; share links use /s/[token]).
  const where = await ownMatchWhere(matchId, { allowAdmin: true });
  if (!where) notFound();

  const match = await prisma.match.findFirst({
    where,
    include: {
      players: { orderBy: { hltvRating: "desc" } },
      rounds: {
        orderBy: { number: "asc" },
        include: {
          kills: { orderBy: { tick: "asc" } },
        },
      },
    },
  });

  if (!match) notFound();

  const ctPlayers = match.players.filter((p) => p.team === "CT");
  const tPlayers = match.players.filter((p) => p.team === "T");
  const ctWon = match.scoreCT >= match.scoreT;
  const tWon = match.scoreT >= match.scoreCT;
  // Players are ordered by rating, so the first one is the match MVP.
  const bestSteamId = match.players[0]?.steamId ?? null;

  // Team mapping for trade / clutch detection
  const teamBySteamId = new Map<string, "CT" | "T">();
  for (const p of match.players) {
    teamBySteamId.set(p.steamId, p.team as "CT" | "T");
  }

  const allKills = match.rounds.flatMap((r) =>
    r.kills.map((k) => ({ ...k, roundId: r.id }))
  );

  // Per-player wallbang / smoke / no-scope kill counts
  const specialsBySteamId = new Map<
    string,
    { wallbangs: number; smokeKills: number; noScopeKills: number }
  >();
  for (const k of allKills) {
    if (!k.wallbang && !k.throughSmoke && !k.noScope) continue;
    let s = specialsBySteamId.get(k.attackerSteamId);
    if (!s) {
      s = { wallbangs: 0, smokeKills: 0, noScopeKills: 0 };
      specialsBySteamId.set(k.attackerSteamId, s);
    }
    if (k.wallbang) s.wallbangs++;
    if (k.throughSmoke) s.smokeKills++;
    if (k.noScope) s.noScopeKills++;
  }

  const augmentPlayer = (p: (typeof match.players)[number]) => ({
    ...p,
    wallbangs: specialsBySteamId.get(p.steamId)?.wallbangs ?? 0,
    smokeKills: specialsBySteamId.get(p.steamId)?.smokeKills ?? 0,
  });

  const trade = detectTradeKills({
    kills: allKills,
    teamBySteamId,
    tickRate: match.tickRate,
  });

  // MatchPlayer.team is the side a player finished on; resolve the side
  // actually played in each round before comparing with round.winner.
  const sideAt = createSideResolver(match.rounds);

  const clutches = detectClutchesBySide({
    rounds: match.rounds.map((r) => ({
      id: r.id,
      number: r.number,
      winner: r.winner as "CT" | "T",
      kills: r.kills,
    })),
    finalTeamBySteamId: teamBySteamId,
    sideAt,
  });

  const clutchByRoundNumber: Record<
    number,
    { steamId: string; playerName: string; team: "CT" | "T"; size: 1 | 2 | 3 | 4 | 5; won: boolean }
  > = {};
  for (const c of clutches) {
    const player = match.players.find((p) => p.steamId === c.clutcherSteamId);
    clutchByRoundNumber[c.roundNumber] = {
      steamId: c.clutcherSteamId,
      playerName: player?.name ?? c.clutcherSteamId,
      team: c.clutcherTeam,
      size: c.size,
      won: c.won,
    };
  }

  // Serialize rounds + kills for client component
  const roundsData = match.rounds.map((r) => ({
    number: r.number,
    winner: r.winner as "CT" | "T",
    winReason: r.winReason,
    buyTypeCT: r.buyType_CT as string,
    buyTypeT: r.buyType_T as string,
    kills: r.kills.map((k) => ({
      attackerSteamId: k.attackerSteamId,
      attackerName: k.attackerName,
      victimName: k.victimName,
      victimSteamId: k.victimSteamId,
      weapon: k.weapon,
      headshot: k.headshot,
      wallbang: k.wallbang,
      throughSmoke: k.throughSmoke,
      noScope: k.noScope,
      isFirstKill: k.isFirstKill,
      traded: trade.tradedKillIds.has(k.id),
      tradeKill: trade.tradeKillIds.has(k.id),
      attackerTeam: (() => {
        const team = teamBySteamId.get(k.attackerSteamId);
        return team ? sideAt(team, r.number) : null;
      })(),
      // Suicides / world deaths and team kills are not frags (multi-kills).
      teamKill:
        k.attackerSteamId === k.victimSteamId ||
        (teamBySteamId.get(k.attackerSteamId) !== undefined &&
          teamBySteamId.get(k.attackerSteamId) === teamBySteamId.get(k.victimSteamId)),
    })),
  }));

  // Detect multi-kills (3K, 4K, ace)
  const multiKills = detectMultiKills(roundsData);
  const multiKillMap = Object.fromEntries(multiKillsByRound(multiKills));

  const toolLinks = [
    { href: `/report/${matchId}`, label: "Co poprawić", icon: ClipboardCheck, primary: true },
    { href: `/matches/${matchId}/team`, label: "Analiza drużynowa", icon: Users },
    { href: `/economy/${matchId}`, label: "Ekonomia", icon: DollarSign },
    { href: `/heatmaps/${matchId}`, label: "Heatmapa", icon: Flame },
    { href: `/replay/${matchId}`, label: "Replay 2D", icon: Play },
    { href: `/grenades/${matchId}`, label: "Granaty", icon: Crosshair },
    { href: `/mechanics/${matchId}`, label: "Mechanika", icon: Footprints },
    { href: `/clips?match=${matchId}`, label: "Klipy", icon: Clapperboard },
  ];

  const meta = [
    formatDate(match.date),
    match.duration > 0 ? formatDuration(match.duration) : null,
    match.server || null,
  ].filter((x): x is string => !!x);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/matches", label: "Wróć do meczów" }}
        eyebrow="Analiza meczu"
        title={mapDisplayName(match.map)}
        description={
          <span className="flex flex-wrap gap-x-2">
            {meta.map((m, i) => (
              <span key={i} className={i === 1 ? "font-mono tabular-nums" : undefined}>
                {i > 0 && <span className="mr-2 text-[var(--text-disabled)]">·</span>}
                {m}
              </span>
            ))}
          </span>
        }
      />

      {/* Match hero: score, tools, round timeline */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <MapThumb map={match.map} size="lg" className="hidden sm:block" />
          <div className="flex flex-1 items-center justify-center gap-4 sm:gap-6">
            <div className="text-center">
              <p className="label-overline text-[var(--ct-blue)]">CT</p>
              <p
                className="font-mono text-4xl font-bold leading-none tabular-nums sm:text-5xl"
                style={{ color: ctWon ? "var(--ct-blue)" : "var(--text-tertiary)" }}
              >
                {match.scoreCT}
              </p>
            </div>
            <span className="text-2xl text-[var(--text-disabled)]" aria-hidden>
              :
            </span>
            <div className="text-center">
              <p className="label-overline text-[var(--t-gold)]">T</p>
              <p
                className="font-mono text-4xl font-bold leading-none tabular-nums sm:text-5xl"
                style={{ color: tWon ? "var(--t-gold)" : "var(--text-tertiary)" }}
              >
                {match.scoreT}
              </p>
            </div>
          </div>
          <div className="hidden w-14 sm:block" aria-hidden />
        </div>

        {/* Tool links: one scrollable chip row on phones */}
        <nav aria-label="Narzędzia meczu" className="-mx-4 mt-5 md:mx-0">
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
            {toolLinks.map(({ href, label, icon: Icon, primary }) => (
              <Link
                key={href}
                href={href}
                className={buttonVariants({ variant: primary ? "primary" : "secondary", size: "sm", className: "shrink-0" })}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Interactive round timeline */}
        {roundsData.length > 0 && (
          <RoundTimeline
            rounds={roundsData}
            multiKillMap={multiKillMap}
            clutchMap={clutchByRoundNumber}
          />
        )}
      </Card>

      {/* Scoreboards */}
      <div className="space-y-4">
        <ScoreboardTable
          title="Antyterroryści"
          team="CT"
          score={match.scoreCT}
          players={ctPlayers.map(augmentPlayer)}
          bestSteamId={bestSteamId}
        />
        <ScoreboardTable
          title="Terroryści"
          team="T"
          score={match.scoreT}
          players={tPlayers.map(augmentPlayer)}
          bestSteamId={bestSteamId}
        />
        <ScoreboardLegend />
      </div>
    </div>
  );
}
