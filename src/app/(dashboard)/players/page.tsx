import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, EmptyState, InitialsAvatar, PageHeader, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { GitCompareArrows, Upload, Users } from "lucide-react";
import Link from "next/link";

export default async function PlayersPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // Get all match players from user's matches
  const matchPlayers = userId
    ? await prisma.matchPlayer.findMany({
        where: { match: { upload: { userId } } },
        select: {
          steamId: true,
          name: true,
          team: true,
          kills: true,
          deaths: true,
          assists: true,
          adr: true,
          hltvRating: true,
          hsPercent: true,
          firstKills: true,
          firstDeaths: true,
        },
      })
    : [];

  // Aggregate by steamId
  const playerMap = new Map<
    string,
    {
      steamId: string;
      name: string;
      matches: number;
      totalKills: number;
      totalDeaths: number;
      totalAssists: number;
      totalAdr: number;
      totalHltv: number;
      totalHs: number;
      totalFk: number;
      totalFd: number;
    }
  >();

  for (const p of matchPlayers) {
    const existing = playerMap.get(p.steamId);
    if (existing) {
      existing.matches++;
      existing.name = p.name; // use latest name
      existing.totalKills += p.kills;
      existing.totalDeaths += p.deaths;
      existing.totalAssists += p.assists;
      existing.totalAdr += p.adr;
      existing.totalHltv += p.hltvRating;
      existing.totalHs += p.hsPercent;
      existing.totalFk += p.firstKills;
      existing.totalFd += p.firstDeaths;
    } else {
      playerMap.set(p.steamId, {
        steamId: p.steamId,
        name: p.name,
        matches: 1,
        totalKills: p.kills,
        totalDeaths: p.deaths,
        totalAssists: p.assists,
        totalAdr: p.adr,
        totalHltv: p.hltvRating,
        totalHs: p.hsPercent,
        totalFk: p.firstKills,
        totalFd: p.firstDeaths,
      });
    }
  }

  // Sort by avg HLTV descending
  const players = Array.from(playerMap.values())
    .map((p) => ({
      steamId: p.steamId,
      name: p.name,
      matches: p.matches,
      avgKills: p.totalKills / p.matches,
      avgDeaths: p.totalDeaths / p.matches,
      kd: p.totalDeaths > 0 ? p.totalKills / p.totalDeaths : p.totalKills,
      avgAdr: p.totalAdr / p.matches,
      avgHltv: p.totalHltv / p.matches,
      avgHs: p.totalHs / p.matches,
      totalFk: p.totalFk,
      totalFd: p.totalFd,
    }))
    .sort((a, b) => b.avgHltv - a.avgHltv);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analiza"
        title="Gracze"
        description="Wszyscy gracze z Twoich przeanalizowanych demek ze statystykami zbiorczymi."
        actions={
          players.length >= 2 ? (
            <Link href="/compare" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <GitCompareArrows className="h-4 w-4" aria-hidden />
              Porównaj graczy
            </Link>
          ) : undefined
        }
      />

      {players.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Brak danych o graczach"
          description="Wgraj demo, a statystyki graczy pojawią się tutaj."
          action={
            <Link href="/upload" className={buttonVariants({ variant: "cta" })}>
              <Upload className="h-4 w-4" aria-hidden />
              Wgraj demo
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden p-0 md:p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <p className="text-sm text-[var(--text-secondary)]">
              <span className="font-mono tabular-nums text-[var(--text-primary)]">{players.length}</span>{" "}
              {players.length === 1 ? "gracz" : pluralPl(players.length, "gracze", "graczy")}
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">Sortowanie: śr. rating HLTV</p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Gracz</th>
                  <th scope="col">Mecze</th>
                  <th scope="col">K/D</th>
                  <th scope="col" title="Średnio zabójstw na mecz">Śr. K</th>
                  <th scope="col" title="Średnio śmierci na mecz">Śr. D</th>
                  <th scope="col">ADR</th>
                  <th scope="col" title="Średni rating HLTV">Rating</th>
                  <th scope="col">HS%</th>
                  <th scope="col" title="Pierwsze zabójstwa w rundzie (opening kills)">FK</th>
                  <th scope="col" title="Pierwsze śmierci w rundzie (opening deaths)">FD</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.steamId}>
                    <td>
                      <Link
                        href={`/players/${p.steamId}`}
                        className="flex min-h-11 min-w-0 items-center gap-2.5 font-medium text-[var(--text-primary)] hover:text-[var(--accent)] md:min-h-0"
                      >
                        <InitialsAvatar name={p.name} size="sm" />
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </td>
                    <td>{p.matches}</td>
                    <td className={cn("font-semibold", ratingClass(p.kd))}>{p.kd.toFixed(2)}</td>
                    <td className="text-[var(--text-primary)]">{p.avgKills.toFixed(1)}</td>
                    <td>{p.avgDeaths.toFixed(1)}</td>
                    <td className="text-[var(--text-primary)]">{p.avgAdr.toFixed(1)}</td>
                    <td className={cn("font-semibold", ratingClass(p.avgHltv))}>{p.avgHltv.toFixed(2)}</td>
                    <td>{p.avgHs.toFixed(0)}%</td>
                    <td>{p.totalFk}</td>
                    <td>{p.totalFd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Same thresholds as before: ≥1.2 good, <0.8 weak. */
function ratingClass(v: number): string {
  return v >= 1.2 ? "text-[var(--good)]" : v >= 0.8 ? "text-[var(--text-primary)]" : "text-[var(--mistake)]";
}

/** Polish plural for counts ≥ 2: 2–4 (not 12–14) → few, otherwise many. */
function pluralPl(n: number, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}
