import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { userFolders } from "@/lib/team/folders";
import { getTeamMapReport, teamLineups, teamMaps } from "@/lib/team/load";
import { loadMapLanes } from "@/lib/team/map-lanes-load";
import { detectTeams, rosterKey } from "@/lib/team/detect";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { MapThumb } from "@/components/match";
import { TeamMapAnalysis } from "@/components/team-analysis/team-map-analysis";
import { SaveTeamFolder, ShareTeamLink } from "@/components/team-analysis/folder-tools";
import { PrintButton } from "@/components/team/print-button";
import { folderOfTeam, opponentLabels } from "../view";
import { Users } from "lucide-react";

export const metadata = { title: "Analiza drużyny — CS2 Analyst" };

interface Props {
  searchParams: Promise<{ roster?: string; map?: string }>;
}

/**
 * /team-analysis/team?roster=<SteamIDs> — one detected team over every
 * team-analysis demo it played (≥ 3 of its players together), one map at a
 * time: key points, pistols and what follows them, repeated plays, positions,
 * utility and every round.
 */
export default async function TeamPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/team-analysis");
  const { t } = await getT();
  const query = await searchParams;
  const roster = (query.roster ?? "")
    .split(",")
    .filter((id) => /^\d{5,20}$/.test(id))
    .slice(0, 10);
  if (roster.length < 2) notFound();

  const [rows, lineups, maps] = await Promise.all([userFolders(prisma, userId), teamLineups(prisma, userId), teamMaps(prisma, userId, roster)]);
  const team = detectTeams(lineups).find((tm) => tm.core.filter((p) => roster.includes(p.steamId)).length >= 3);
  const folder = folderOfTeam(rows, roster);
  const title = folder?.name ?? `Drużyna ${team?.core[0]?.name ?? ""}`.trim();
  const map = maps.find((m) => m.map === query.map)?.map ?? maps[0]?.map;
  const report = map ? await getTeamMapReport(prisma, userId, roster, map) : null;
  if (map) await loadMapLanes(prisma, map);
  const myTeams = (
    await prisma.teamMember.findMany({ where: { userId }, select: { team: { select: { id: true, name: true } } } })
  ).map((m) => m.team);
  const opponents = report ? await opponentLabels(report.matches.map((m) => m.matchId), roster) : new Map<string, string>();
  const href = (m: string) => `/team-analysis/team?roster=${encodeURIComponent(rosterKey(roster))}&map=${m}`;

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        back={{ href: "/team-analysis", label: "Analizy drużyn" }}
        eyebrow="Analiza drużyny"
        title={title}
        description="Ze wszystkich Twoich dem drużynowych, w których grało co najmniej 3 z tych graczy. Wyniki są zapisywane, więc kolejne otwarcie jest natychmiastowe."
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <ShareTeamLink steamIds={roster} title={title} />
            <PrintButton label="Drukuj / PDF" />
            {folder ? (
              <Link href={`/team-analysis/${folder.id}`} className="text-sm text-[var(--accent-hover)] hover:underline">
                Folder: {folder.name}
              </Link>
            ) : (
              <SaveTeamFolder steamIds={roster} defaultName={title} />
            )}
          </div>
        }
      />
      {team && (
        <Card className="space-y-1 text-sm">
          <p className="flex items-center gap-2 text-[var(--text-primary)]">
            <Users className="h-4 w-4 text-[var(--accent)]" aria-hidden />
            {team.core.map((p) => `${p.name} (${p.matches})`).join(", ")}
          </p>
          {team.standIns.length > 0 && (
            <p className="text-xs text-[var(--text-tertiary)]">Stand-in: {team.standIns.map((p) => `${p.name} (${p.matches})`).join(", ")}</p>
          )}
        </Card>
      )}
      {maps.length === 0 ? (
        <EmptyState icon={Users} title="Brak dem tej drużyny" description="Wgraj demo jako „Analiza drużynowa”." />
      ) : (
        <nav aria-label="Mapy" className="flex flex-wrap gap-2">
          {maps.map((m) => (
            <Link
              key={m.map}
              href={href(m.map)}
              aria-current={m.map === map ? "true" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                m.map === map
                  ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
              )}
            >
              <MapThumb map={m.map} size="sm" />
              {mapDisplayName(m.map)} <span className="font-mono text-xs text-[var(--text-tertiary)]">{m.matches}</span>
            </Link>
          ))}
        </nav>
      )}
      {report && <TeamMapAnalysis report={report} t={t} opponents={opponents} teams={myTeams} />}
    </div>
  );
}
