import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, StatCard, buttonVariants } from "@/components/ui";
import { MapThumb, ResultBadge, SourceBadge, resultColor, resultFor, type MatchResult } from "@/components/match";
import { formatDate } from "@/lib/utils/formatters";
import { Flame, Upload } from "lucide-react";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { FaceitSyncTrigger } from "@/components/faceit-sync-trigger";
import { FaceitHistoryPicker } from "@/components/faceit-history-picker";
import { activeUploadId, faceitDownloadsEnabled, FACEIT_UPLOAD_INCLUDE } from "@/lib/faceit/analyze";
import { getPlanUsage } from "@/lib/limits";
import Link from "next/link";

/** "1 gracz", "4 graczy" — Polish plural for the player count. */
function playersLabel(n: number): string {
  if (n === 1) return "1 gracz";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} gracze`;
  return `${n} graczy`;
}

export default async function MatchesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const userSteamId = session?.user?.steamId;

  // Fetch parsed matches (from uploaded demos)
  const parsedMatches = userId
    ? await prisma.match.findMany({
        where: { upload: { userId } },
        include: {
          players: true,
          upload: { select: { createdAt: true, source: true, faceitMatchId: true } },
          rounds: {
            select: {
              number: true,
              kills: { select: { attackerSteamId: true, attackerName: true } },
            },
          },
        },
        orderBy: { date: "desc" },
      })
    : [];

  // Fetch FACEIT metadata matches. Includes matches with an in-flight
  // download (uploadId set but not yet parsed) so the download progress
  // button stays visible; fully-parsed ones are filtered out below.
  const faceitMatches = userId
    ? await prisma.faceitMatch.findMany({
        where: { userId },
        include: FACEIT_UPLOAD_INCLUDE,
        orderBy: { date: "desc" },
      })
    : [];
  const usage = userId ? await getPlanUsage(userId) : null;

  // Check DB for faceitId (don't rely on session JWT)
  const dbUser = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { faceitId: true },
      })
    : null;

  // Aggregate stats from parsed matches only
  const matchCount = parsedMatches.length;
  let wins = 0;
  let totalHltv = 0;
  let totalAdr = 0;
  let playerMatches = 0;

  for (const match of parsedMatches) {
    const userPlayer = userSteamId
      ? match.players.find((p) => p.steamId === userSteamId)
      : null;

    if (userPlayer) {
      playerMatches++;
      totalHltv += userPlayer.hltvRating;
      totalAdr += userPlayer.adr;

      const userTeamWon =
        (userPlayer.team === "CT" && match.scoreCT > match.scoreT) ||
        (userPlayer.team === "T" && match.scoreT > match.scoreCT);
      if (userTeamWon) wins++;
    }
  }

  const winRate = playerMatches > 0 ? Math.round((wins / playerMatches) * 100) : 0;
  const avgHltv = playerMatches > 0 ? (totalHltv / playerMatches).toFixed(2) : "--";
  const avgAdr = playerMatches > 0 ? (totalAdr / playerMatches).toFixed(1) : "--";

  // Build a set of faceitMatchIds that are already parsed
  const parsedFaceitIds = new Set(
    parsedMatches
      .map((m) => m.upload?.faceitMatchId)
      .filter(Boolean)
  );

  // Filter out FACEIT matches that already have a parsed demo
  const unlinkedFaceitMatches = faceitMatches.filter(
    (fm) => !parsedFaceitIds.has(fm.faceitMatchId)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analiza"
        title="Mecze"
        description="Twoja historia meczów CS2 i podsumowanie statystyk."
        actions={
          <>
            <FaceitSyncTrigger hasFaceit={!!dbUser?.faceitId} />
            <Link href="/upload" className={buttonVariants({ variant: "cta" })}>
              <Upload className="h-4 w-4" aria-hidden />
              Wgraj demo
            </Link>
          </>
        }
      />

      {/* Stat overview row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Rozegrane mecze" value={matchCount || "--"} />
        <StatCard
          label="Win rate"
          value={playerMatches > 0 ? `${winRate}%` : "--%"}
          accentColor="var(--good)"
        />
        <StatCard label="Śr. rating HLTV" value={avgHltv} />
        <StatCard label="Śr. ADR" value={avgAdr} />
      </div>

      {/* Parsed match list */}
      {parsedMatches.length === 0 && unlinkedFaceitMatches.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="Brak meczów"
          description="Wgraj swoje pierwsze demo, a analiza meczu pojawi się tutaj."
          action={
            <Link href="/upload" className={buttonVariants({ variant: "primary" })}>
              Wgraj demo
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {parsedMatches.length > 0 && (
            <SectionTitle className="mb-0">Przeanalizowane mecze</SectionTitle>
          )}

          {/* Parsed matches — full analytics available */}
          {parsedMatches.map((match) => {
            const topPlayer = match.players.reduce((a, b) =>
              a.hltvRating > b.hltvRating ? a : b
            );

            const userPlayer = userSteamId
              ? match.players.find((p) => p.steamId === userSteamId)
              : null;
            const result: MatchResult | null = userPlayer
              ? resultFor(userPlayer.team, match.scoreCT, match.scoreT)
              : null;

            // Detect aces in this match
            let aceInfo: { playerName: string; roundNumber: number } | null = null;
            for (const round of match.rounds) {
              const killCounts = new Map<string, { name: string; count: number }>();
              for (const kill of round.kills) {
                const existing = killCounts.get(kill.attackerSteamId);
                if (existing) existing.count++;
                else killCounts.set(kill.attackerSteamId, { name: kill.attackerName, count: 1 });
              }
              for (const [, data] of killCounts) {
                if (data.count >= 5) {
                  aceInfo = { playerName: data.name, roundNumber: round.number };
                  break;
                }
              }
              if (aceInfo) break;
            }

            // Score digits: colored by the user's result when they played,
            // otherwise the winning side's number is highlighted.
            const scoreColor = (own: number, other: number) =>
              result
                ? resultColor(result)
                : own > other
                  ? "var(--text-primary)"
                  : "var(--text-tertiary)";

            const score = (
              <span
                className="stat-small whitespace-nowrap"
                title="Wynik CT : T"
              >
                <span style={{ color: scoreColor(match.scoreCT, match.scoreT) }}>
                  {match.scoreCT}
                </span>
                <span className="mx-1 text-[var(--text-disabled)]">:</span>
                <span style={{ color: scoreColor(match.scoreT, match.scoreCT) }}>
                  {match.scoreT}
                </span>
              </span>
            );

            const mvp = (
              <>
                <span className="label-overline mr-1.5 text-[var(--text-tertiary)]">MVP</span>
                <span className="text-[var(--text-secondary)]">{topPlayer.name}</span>{" "}
                <span className="stat-inline text-[var(--text-primary)]">
                  {topPlayer.hltvRating.toFixed(2)}
                </span>
              </>
            );

            return (
              <Link
                key={match.id}
                href={`/matches/${match.id}`}
                className="block rounded-xl focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)]"
              >
                <Card
                  className="flex items-center gap-3 border-l-[3px] p-3 sm:gap-4 md:p-4"
                  style={{ borderLeftColor: resultColor(result) }}
                >
                  <MapThumb map={match.map} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        <p className="truncate font-display font-semibold text-[var(--text-primary)]">
                          {mapDisplayName(match.map)}
                        </p>
                        {result && <ResultBadge result={result} />}
                        <SourceBadge source={match.upload?.source} />
                        {aceInfo && (
                          <Badge
                            variant="default"
                            className="min-w-0 max-w-full text-[11px]"
                            title={`ACE: ${aceInfo.playerName} (runda ${aceInfo.roundNumber})`}
                          >
                            <Flame className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="min-w-0 truncate">
                              ACE {aceInfo.playerName}{" "}
                              <span className="font-mono tabular-nums">(R{aceInfo.roundNumber})</span>
                            </span>
                          </Badge>
                        )}
                      </div>
                      <div className="shrink-0 sm:hidden">{score}</div>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                      {formatDate(match.date)} · {playersLabel(match.players.length)}
                    </p>
                    <p className="mt-1 truncate text-xs sm:hidden">{mvp}</p>
                  </div>

                  <div className="hidden shrink-0 items-center gap-6 sm:flex">
                    <p className="max-w-[220px] truncate text-right text-sm">{mvp}</p>
                    {score}
                  </div>
                </Card>
              </Link>
            );
          })}

          {/* FACEIT history — pick matches to analyze */}
          {unlinkedFaceitMatches.length > 0 && (
            <div className={parsedMatches.length > 0 ? "pt-6" : ""}>
              <FaceitHistoryPicker
                matches={unlinkedFaceitMatches.map((fm) => ({
                  id: fm.id,
                  map: fm.map,
                  score: fm.score,
                  date: fm.date.toISOString(),
                  competition: fm.competition,
                  result: fm.result,
                  faceitUrl: fm.faceitUrl,
                  demoStatus: fm.demoStatus,
                  uploadId: activeUploadId(fm),
                }))}
                downloadsEnabled={faceitDownloadsEnabled()}
                remaining={usage?.remaining ?? 0}
                monthlyLimit={usage?.limit ?? 0}
                batchSize={usage?.limits.batchSize ?? 0}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
