import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ChevronRight, Folder, Upload } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { folderChain, folderOptions, folderRoster, subtreeIds, userFolders } from "@/lib/team/folders";
import { getFolderReports } from "@/lib/team/load";
import { loadMapLanes } from "@/lib/team/map-lanes-load";
import { defaultSpots, reportMap, summaryLines, tacticCounts, topUtility, utilName } from "@/lib/team/breakdown-text";
import { ctSpotOf, shortPlace } from "@/lib/team/map-lanes";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { Card, PageHeader, SectionTitle, buttonVariants } from "@/components/ui";
import { MapThumb } from "@/components/match";
import { DemoFolderSelect, FolderActions, NewFolderButton, RosterPicker } from "@/components/team-analysis/folder-tools";

/**
 * /team-analysis and /team-analysis/[folderId]: the player's team analysis
 * demos (scouting) in folders, and for a folder with a team roster the
 * summary of what that team plays over every demo in it and below.
 */
export async function TeamAnalysisView({ folderId }: { folderId: string | null }) {
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

  const roster = folderId ? folderRoster(rows, folderId) : [];
  const reports = folderId && roster.length > 0 ? await getFolderReports(prisma, userId, subtreeIds(rows, folderId), roster) : [];
  await Promise.all(reports.map((r) => loadMapLanes(prisma, reportMap(r))));
  // Lineups to pick the folder's team from: both sides of the demos in it and below.
  const pickFrom = folderId
    ? await prisma.demoUpload.findMany({
        where: { userId, kind: "TEAM", deletedAt: null, folderId: { in: subtreeIds(rows, folderId) }, matchId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, match: { select: { map: true, date: true, players: { select: { steamId: true, name: true, team: true } } } } },
      })
    : [];
  const lineups = pickFrom.flatMap((d) =>
    d.match
      ? (["CT", "T"] as const).map((side) => ({
          key: `${d.id}:${side}`,
          label: `${mapDisplayName(d.match!.map)} ${formatDate(d.match!.date)}: ${d.match!.players.filter((p) => p.team === side).map((p) => p.name).join(", ")}`,
          steamIds: d.match!.players.filter((p) => p.team === side).map((p) => p.steamId),
        }))
      : []
  );
  const rosterNames = new Map<string, string>();
  for (const d of pickFrom) for (const p of d.match?.players ?? []) rosterNames.set(p.steamId, p.name);

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Analizy drużyn"
        title={folder?.name ?? "Analizy drużyn"}
        description="Cudze dema do analizy drużynowej, w folderach. Folder z wybraną drużyną pokazuje podsumowanie ze wszystkich dem w nim i w podfolderach."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/upload?kind=team${folderId ? `&folder=${folderId}` : ""}`}
              className={buttonVariants({ variant: "cta", size: "sm" })}
            >
              <Upload className="h-4 w-4" aria-hidden />
              Wgraj demo
            </Link>
            <NewFolderButton parentId={folderId} />
            {folder && <FolderActions folder={{ id: folder.id, name: folder.name, parentId: folder.parentId }} options={options} />}
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
                <span className="text-xs text-[var(--text-tertiary)]">{rows.filter((r) => r.parentId === c.id).length || ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {folder && (
        <section aria-labelledby="druzyna" className="space-y-3">
          <SectionTitle>
            <span id="druzyna">Analizowana drużyna</span>
          </SectionTitle>
          <Card className="space-y-2">
            {roster.length > 0 ? (
              <p className="text-sm text-[var(--text-primary)]">
                {roster.map((id) => rosterNames.get(id) ?? id).join(", ")}
                {folder.steamIds.length === 0 && <span className="text-[var(--text-tertiary)]"> (z folderu nadrzędnego)</span>}
              </p>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                Wybierz skład drużyny z jednego z dem. Podsumowanie weźmie wszystkie dema, w których gra co najmniej 3 z tych graczy.
              </p>
            )}
            {lineups.length > 0 && <RosterPicker folderId={folder.id} lineups={lineups} />}
          </Card>
        </section>
      )}

      {reports.map((report) => {
        const map = reportMap(report);
        const tRounds = report.rounds.filter((r) => r.side === "T");
        const ctRounds = report.rounds.filter((r) => r.side === "CT");
        const spot = (place: string) => ctSpotOf(map, place) ?? shortPlace(map, place);
        return (
          <section key={map} aria-labelledby={`mapa-${map}`} className="space-y-3">
            <SectionTitle>
              <span id={`mapa-${map}`} className="flex items-center gap-2">
                <MapThumb map={map} size="sm" />
                {mapDisplayName(map)} · {report.matches.length} {report.matches.length === 1 ? "demo" : "dem"}
              </span>
            </SectionTitle>
            <Card>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--text-primary)]">
                {summaryLines(t, report).map((line, n) => (
                  <li key={n}>{line}</li>
                ))}
              </ul>
            </Card>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">Taktyki T</h3>
                <CountList rows={tacticCounts(t, report).map(([label, n]) => ({ label, n }))} of={tRounds.length} />
              </Card>
              <Card className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">Default T</h3>
                <CountList rows={defaultSpots(map, tRounds).slice(0, 8).map((d) => ({ label: d.place, n: d.rounds }))} of={tRounds.length} />
              </Card>
              <Card className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">Pozycje CT</h3>
                <CountList
                  rows={defaultSpots(
                    map,
                    ctRounds.map((r) => ({ ...r, positions: r.positions.map((p) => ({ ...p, place: spot(p.place) })) }))
                  ).map((d) => ({ label: d.place, n: d.rounds }))}
                  of={ctRounds.length}
                />
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {(["T", "CT"] as const).map((side) => (
                <Card key={side} className="space-y-2">
                  <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">Granaty {side}</h3>
                  <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                    {topUtility(
                      map,
                      report.rounds.filter((r) => r.side === side),
                      8
                    ).map((u) => (
                      <li key={`${u.type}|${u.place}`} className="flex gap-2">
                        <span className="w-20 shrink-0 text-[var(--text-primary)]">{utilName(t, u.type)}</span>
                        <span className="min-w-0 flex-1 truncate">{u.place}</span>
                        <span className="font-mono text-xs text-[var(--text-tertiary)]">×{u.count}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      <section aria-labelledby="dema" className="space-y-3">
        <SectionTitle>
          <span id="dema">Dema {folder ? "w tym folderze" : "bez folderu"}</span>
        </SectionTitle>
        {demos.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">Brak dem. Wgraj demo jako „Analiza drużynowa”.</p>
        ) : (
          <ul className="grid gap-2">
            {demos.map((d) => (
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
      </section>
    </div>
  );
}

function CountList({ rows, of }: { rows: Array<{ label: string; n: number }>; of: number }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--text-tertiary)]">—</p>;
  return (
    <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
      {rows.map((d) => (
        <li key={d.label} className="flex gap-2">
          <span className="min-w-0 flex-1 truncate">{d.label}</span>
          <span className="font-mono text-xs text-[var(--text-tertiary)]">
            {d.n}/{of}
          </span>
        </li>
      ))}
    </ul>
  );
}
