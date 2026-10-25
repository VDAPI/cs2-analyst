import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ChevronRight, Folder, Upload, Users } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { folderChain, folderOptions, folderRoster, subtreeIds, userFolders, type FolderRow } from "@/lib/team/folders";
import { getTeamMapReport, teamLineups, teamMaps } from "@/lib/team/load";
import { loadMapLanes } from "@/lib/team/map-lanes-load";
import { detectTeams, rosterKey, SAME_TEAM_PLAYERS, type DetectedTeam } from "@/lib/team/detect";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { Card, PageHeader, Pager, SectionTitle, buttonVariants, pageSlice } from "@/components/ui";
import { MapThumb } from "@/components/match";
import { DemoFolderSelect, FolderActions, NewFolderButton, RosterPicker, ShareTeamLink } from "@/components/team-analysis/folder-tools";
import { PrintButton } from "@/components/team/print-button";
import { TeamMapAnalysis } from "@/components/team-analysis/team-map-analysis";

/** Demos per page of a folder's list. */
const DEMOS_PER_PAGE = 15;

/** The folder whose roster is this team (≥ SAME_TEAM_PLAYERS shared), for its name. */
export function folderOfTeam(rows: FolderRow[], core: string[]): FolderRow | null {
  const ids = new Set(core);
  return rows.find((r) => r.steamIds.filter((id) => ids.has(id)).length >= SAME_TEAM_PLAYERS) ?? null;
}

export const teamLabel = (rows: FolderRow[], team: DetectedTeam) =>
  folderOfTeam(
    rows,
    team.core.map((p) => p.steamId)
  )?.name ?? `Drużyna ${team.core[0]?.name ?? "?"}`;

/**
 * /team-analysis and /team-analysis/[folderId]: the player's team analysis
 * demos (scouting) in folders. The top level lists the teams found in all
 * demos; a folder with a team shows that team's analysis, one map at a time.
 */
export async function TeamAnalysisView({ folderId, page = 1, map: mapParam }: { folderId: string | null; page?: number; map?: string }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/team-analysis");
  const { t } = await getT();

  const rows = await userFolders(prisma, userId);
  const folder = folderId ? rows.find((r) => r.id === folderId) : null;
  if (folderId && !folder) notFound();
  const chain = folderId ? folderChain(rows, folderId) : [];
  const children = rows.filter((r) => r.parentId === (folderId ?? null));
  const options = folderOptions(rows);
  const scope = folderId ? subtreeIds(rows, folderId) : undefined;

  const demos = await prisma.demoUpload.findMany({
    where: { userId, kind: "TEAM", deletedAt: null, folderId: folderId ?? null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true,
      match: { select: { id: true, map: true, date: true, scoreCT: true, scoreT: true, players: { select: { steamId: true, name: true, team: true } } } },
    },
  });
  const demoPage = pageSlice(demos, page, DEMOS_PER_PAGE);

  // Teams in the demos (stand-ins don't split a team): all of them at the
  // top level, the ones in this folder to pick its team from.
  const teams = detectTeams(await teamLineups(prisma, userId, scope));
  const roster = folderId ? folderRoster(rows, folderId) : [];

  // The folder's team analysis: one map at a time, cached.
  const maps = roster.length > 0 ? await teamMaps(prisma, userId, roster, scope) : [];
  const map = maps.find((m) => m.map === mapParam)?.map ?? maps[0]?.map;
  const report = map ? await getTeamMapReport(prisma, userId, roster, map, scope) : null;
  if (map) await loadMapLanes(prisma, map);
  const myTeams = (
    await prisma.teamMember.findMany({ where: { userId }, select: { team: { select: { id: true, name: true } } } })
  ).map((m) => m.team);
  const opponents = report ? await opponentLabels(report.matches.map((m) => m.matchId), roster) : new Map<string, string>();
  const nameOf = new Map(teams.flatMap((tm) => [...tm.core, ...tm.standIns]).map((p) => [p.steamId, p.name]));
  const base = `/team-analysis${folderId ? `/${folderId}` : ""}`;

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Analizy drużyn"
        title={folder?.name ?? "Analizy drużyn"}
        description={
          folder
            ? "Analiza drużyny z tego folderu, mapa po mapie, ze wszystkich dem w nim i w podfolderach."
            : "Cudze dema do analizy drużynowej. Drużyny są wykrywane same (stand-in nie rozbija składu); dema możesz układać w folderach."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/upload?kind=team${folderId ? `&folder=${folderId}` : ""}`} className={buttonVariants({ variant: "cta", size: "sm" })}>
              <Upload className="h-4 w-4" aria-hidden />
              Wgraj demo
            </Link>
            <NewFolderButton parentId={folderId} />
            {folder && <FolderActions folder={{ id: folder.id, name: folder.name, parentId: folder.parentId }} options={options} />}
            {folder && roster.length > 0 && <ShareTeamLink steamIds={roster} title={folder.name} />}
            {report && <PrintButton label="Drukuj / PDF" />}
          </div>
        }
      />

      <nav aria-label="Ścieżka" className="flex flex-wrap items-center gap-1 text-sm text-[var(--text-tertiary)]">
        <Link href="/team-analysis" className="hover:text-[var(--text-secondary)]">
          Wszystkie
        </Link>
        {chain.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <Link href={`/team-analysis/${c.id}`} className="hover:text-[var(--text-secondary)]">
              {c.name}
            </Link>
          </span>
        ))}
      </nav>

      {children.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((c) => (
            <li key={c.id}>
              <Link
                href={`/team-analysis/${c.id}`}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 transition-colors hover:border-[var(--border-hover)]"
              >
                <Folder className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!folder && teams.length > 0 && (
        <section aria-labelledby="druzyny" className="space-y-3">
          <SectionTitle>
            <span id="druzyny">Wykryte drużyny</span>
          </SectionTitle>
          <ul className="grid gap-2 md:grid-cols-2">
            {teams.map((team) => (
              <li key={rosterKey(team.core.map((p) => p.steamId))}>
                <Link
                  href={`/team-analysis/team?roster=${encodeURIComponent(rosterKey(team.core.map((p) => p.steamId)))}`}
                  className="block h-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-sm transition-colors hover:border-[var(--border-hover)]"
                >
                  <p className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                    <Users className="h-4 w-4 text-[var(--accent)]" aria-hidden />
                    {teamLabel(rows, team)}
                    <span className="ml-auto font-mono text-xs text-[var(--text-tertiary)]">{team.matches} dem</span>
                  </p>
                  <p className="mt-1 truncate text-[var(--text-secondary)]">{team.core.map((p) => p.name).join(", ")}</p>
                  {team.standIns.length > 0 && (
                    <p className="truncate text-xs text-[var(--text-tertiary)]">Stand-in: {team.standIns.map((p) => p.name).join(", ")}</p>
                  )}
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">{team.maps.map((m) => `${mapDisplayName(m.map)} ${m.matches}`).join(" · ")}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {folder && (
        <section aria-labelledby="druzyna" className="space-y-3">
          <SectionTitle>
            <span id="druzyna">Analizowana drużyna</span>
          </SectionTitle>
          <Card className="space-y-2">
            {roster.length > 0 ? (
              <p className="text-sm text-[var(--text-primary)]">
                {roster.map((id) => nameOf.get(id) ?? id).join(", ")}
                {folder.steamIds.length === 0 && <span className="text-[var(--text-tertiary)]"> (z folderu nadrzędnego)</span>}
              </p>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">Wybierz drużynę wykrytą w demach tego folderu.</p>
            )}
            {teams.length > 0 && (
              <RosterPicker
                folderId={folder.id}
                lineups={teams.map((team) => ({
                  key: rosterKey(team.core.map((p) => p.steamId)),
                  label: `${team.core.map((p) => p.name).join(", ")} (${team.matches} dem)`,
                  steamIds: team.core.map((p) => p.steamId),
                }))}
              />
            )}
          </Card>
        </section>
      )}

      {maps.length > 0 && (
        <nav aria-label="Mapy" className="flex flex-wrap gap-2">
          {maps.map((m) => (
            <Link
              key={m.map}
              href={`${base}?map=${m.map}`}
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

      <section aria-labelledby="dema" className="space-y-3">
        <SectionTitle>
          <span id="dema">Dema {folder ? "w tym folderze" : "bez folderu"}</span>
        </SectionTitle>
        {demos.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">Brak dem. Wgraj demo jako „Analiza drużynowa”.</p>
        ) : (
          <ul className="grid gap-2">
            {demoPage.items.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-sm">
                {d.match && <MapThumb map={d.match.map} size="sm" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[var(--text-primary)]">
                    {d.match ? `${mapDisplayName(d.match.map)} ${d.match.scoreCT}:${d.match.scoreT}` : d.fileName}
                  </p>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">
                    {d.match
                      ? (["CT", "T"] as const).map((s) => d.match!.players.filter((p) => p.team === s).map((p) => p.name).join(", ")).join("  vs  ")
                      : d.status === "FAILED"
                        ? "Analiza nie powiodła się"
                        : "Analizuje się…"}
                  </p>
                </div>
                <span className="text-xs text-[var(--text-tertiary)]">{formatDate((d.match?.date ?? d.createdAt).toISOString())}</span>
                <DemoFolderSelect uploadId={d.id} folderId={folderId} options={options} />
                {d.match && (
                  <Link href={`/matches/${d.match.id}/team`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Rozpiska
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pager page={demoPage.page} pages={demoPage.pages} href={(n) => `${base}?page=${n}`} />
      </section>
    </div>
  );
}

/** "Opponent lineup" per match: the players not on the analysed team's side. */
export async function opponentLabels(matchIds: string[], roster: string[]): Promise<Map<string, string>> {
  const players = await prisma.matchPlayer.findMany({
    where: { matchId: { in: matchIds } },
    select: { matchId: true, steamId: true, name: true, team: true },
  });
  const ids = new Set(roster);
  const out = new Map<string, string>();
  for (const matchId of matchIds) {
    const inMatch = players.filter((p) => p.matchId === matchId);
    const ours = inMatch.filter((p) => ids.has(p.steamId));
    const ourSide = ours.filter((p) => p.team === "CT").length >= ours.length / 2 ? "CT" : "T";
    out.set(
      matchId,
      inMatch
        .filter((p) => p.team !== ourSide)
        .map((p) => p.name)
        .join(", ")
    );
  }
  return out;
}
