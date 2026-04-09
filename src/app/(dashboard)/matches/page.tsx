import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, StatCard } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { FaceitSyncTrigger } from "@/components/faceit-sync-trigger";
import Link from "next/link";

export default async function MatchesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // Fetch parsed matches (from uploaded demos)
  const parsedMatches = userId
    ? await prisma.match.findMany({
        where: { upload: { userId } },
        include: {
          players: true,
          upload: { select: { createdAt: true, source: true, faceitMatchId: true } },
        },
        orderBy: { date: "desc" },
      })
    : [];

  // Fetch FACEIT metadata matches (not yet uploaded)
  const faceitMatches = userId
    ? await prisma.faceitMatch.findMany({
        where: { userId, uploadId: null }, // only unlinked ones
        orderBy: { date: "desc" },
      })
    : [];

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
    const userSteamId = session?.user?.steamId;
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Matches
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Your recent CS2 match history and stats overview.
          </p>
        </div>
        <FaceitSyncTrigger hasFaceit={!!dbUser?.faceitId} />
      </div>

      {/* Stat overview row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Matches Played" value={matchCount || "--"} />
        <StatCard
          label="Win Rate"
          value={playerMatches > 0 ? `${winRate}%` : "--%"}
          accentColor="var(--success)"
        />
        <StatCard label="Avg HLTV" value={avgHltv} accentColor="var(--t-gold)" />
        <StatCard label="Avg ADR" value={avgAdr} accentColor="var(--ct-blue)" />
      </div>

      {/* Parsed match list */}
      {parsedMatches.length === 0 && unlinkedFaceitMatches.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-medium text-[var(--text-secondary)]">
              No matches yet
            </p>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              Upload your first demo to see match analytics here.
            </p>
            <Link
              href="/upload"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-5 text-sm font-medium text-white transition-all hover:bg-[var(--accent-hover)]"
            >
              Upload Demo
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Parsed matches — full analytics available */}
          {parsedMatches.map((match) => {
            const ctWon = match.scoreCT > match.scoreT;
            const topPlayer = match.players.reduce((a, b) =>
              a.hltvRating > b.hltvRating ? a : b
            );

            const userSteamId = session?.user?.steamId;
            const userPlayer = userSteamId
              ? match.players.find((p) => p.steamId === userSteamId)
              : null;
            let result: "win" | "loss" | "draw" | null = null;
            if (userPlayer) {
              const userTeamScore = userPlayer.team === "CT" ? match.scoreCT : match.scoreT;
              const enemyScore = userPlayer.team === "CT" ? match.scoreT : match.scoreCT;
              result = userTeamScore > enemyScore ? "win" : userTeamScore < enemyScore ? "loss" : "draw";
            }

            const borderColor =
              result === "win" ? "#22c55e" :
              result === "loss" ? "#ef4444" :
              "#71717a";

            return (
              <Link key={match.id} href={`/matches/${match.id}`}>
                <Card
                  className="flex items-center justify-between border-l-[3px] p-4 transition-all duration-150 hover:border-[var(--border-hover)]"
                  style={{ borderLeftColor: borderColor }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--surface-3)] bg-cover bg-center"
                      style={{
                        backgroundImage: `url(/maps/${match.map}_radar.png)`,
                        filter: "grayscale(40%) brightness(0.7)",
                      }}
                    />

                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[var(--text-primary)]">
                          {mapDisplayName(match.map)}
                        </p>
                        {result && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                              result === "win"
                                ? "bg-[rgba(34,197,94,0.15)] text-[#22c55e]"
                                : result === "loss"
                                  ? "bg-[rgba(239,68,68,0.15)] text-[#ef4444]"
                                  : "bg-[rgba(113,113,122,0.15)] text-[#71717a]"
                            }`}
                          >
                            {result === "win" ? "W" : result === "loss" ? "L" : "D"}
                          </span>
                        )}
                        {match.upload?.source === "FACEIT" && (
                          <span className="rounded-full bg-[rgba(255,85,0,0.15)] px-1.5 py-0.5 text-[10px] font-bold text-[#ff5500]">
                            FACEIT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {match.date.toLocaleDateString()} — {match.players.length} players
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-[var(--text-tertiary)]">MVP</p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {topPlayer.name}{" "}
                        <span className="stat-inline text-[var(--t-gold)]">
                          {topPlayer.hltvRating.toFixed(2)}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`stat-small ${ctWon ? "text-[var(--ct-blue)]" : "text-[var(--text-tertiary)]"}`}>
                        {match.scoreCT}
                      </span>
                      <span className="text-[var(--text-disabled)]">:</span>
                      <span className={`stat-small ${!ctWon ? "text-[var(--t-gold)]" : "text-[var(--text-tertiary)]"}`}>
                        {match.scoreT}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}

          {/* FACEIT matches — metadata only, no demo uploaded yet */}
          {unlinkedFaceitMatches.length > 0 && (
            <>
              {parsedMatches.length > 0 && (
                <div className="flex items-center gap-3 pt-4">
                  <div className="h-px flex-1 bg-[var(--border)]" />
                  <span className="text-xs font-medium text-[var(--text-tertiary)]">
                    FACEIT Matches — upload demo to analyze
                  </span>
                  <div className="h-px flex-1 bg-[var(--border)]" />
                </div>
              )}

              {unlinkedFaceitMatches.map((fm) => {
                const [s1, s2] = fm.score.split("-").map(Number);

                return (
                  <Card
                    key={fm.id}
                    className="flex items-center justify-between border-l-[3px] p-4 opacity-75"
                    style={{ borderLeftColor: "#ff5500" }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--surface-3)] bg-cover bg-center"
                        style={{
                          backgroundImage: `url(/maps/${fm.map}_radar.png)`,
                          filter: "grayscale(40%) brightness(0.7)",
                        }}
                      />

                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-[var(--text-primary)]">
                            {mapDisplayName(fm.map)}
                          </p>
                          <span className="rounded-full bg-[rgba(255,85,0,0.15)] px-1.5 py-0.5 text-[10px] font-bold text-[#ff5500]">
                            FACEIT
                          </span>
                          <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
                            No demo
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {fm.date.toLocaleDateString()}
                          {fm.competition ? ` — ${fm.competition}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="stat-small text-[var(--text-primary)]">
                          {s1}
                        </span>
                        <span className="text-[var(--text-disabled)]">:</span>
                        <span className="stat-small text-[var(--text-primary)]">
                          {s2}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={fm.faceitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center rounded-lg bg-[var(--surface-3)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                        >
                          View on FACEIT
                        </a>
                        <Link
                          href={`/upload?faceitMatchId=${fm.faceitMatchId}`}
                          className="inline-flex h-8 items-center rounded-lg bg-[var(--accent)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                        >
                          Upload Demo
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
