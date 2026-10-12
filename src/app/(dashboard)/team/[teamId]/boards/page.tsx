import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { LayoutDashboard } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { getTeamContext } from "@/lib/team/load";
import { boardMaps } from "@/lib/team/maps";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { Badge, EmptyState, SectionTitle } from "@/components/ui";
import { MapThumb } from "@/components/match";
import { TeamHeader } from "@/components/team/team-header";
import { BoardCreate } from "@/components/team/board-create";

interface Props {
  params: Promise<{ teamId: string }>;
}

/** /team/[teamId]/boards — the team's saved tactic boards. */
export default async function BoardsPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { teamId } = await params;
  const { t } = await getT();
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) notFound();

  const boards = await prisma.tacticBoard.findMany({
    where: { teamId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      map: true,
      side: true,
      updatedAt: true,
      rival: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });

  return (
    <div className="min-w-0 space-y-8">
      <TeamHeader team={ctx.team} active="boards" title={t("teamBoard.title")} description={t("teamBoard.description")} />

      <BoardCreate teamId={teamId} maps={boardMaps().map((m) => ({ name: m.name, displayName: m.displayName }))} />

      <section aria-labelledby="tablice" className="space-y-3">
        <SectionTitle>
          <span id="tablice">{t("teamBoard.listTitle", { n: boards.length })}</span>
        </SectionTitle>
        {boards.length === 0 ? (
          <EmptyState icon={LayoutDashboard} title={t("teamBoard.emptyTitle")} description={t("teamBoard.emptyBody")} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {boards.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/team/${teamId}/boards/${b.id}`}
                  className="flex min-h-16 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 transition-colors hover:border-[var(--border-hover)]"
                >
                  <MapThumb map={b.map} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[var(--text-primary)]">{b.name}</span>
                    <span className="block truncate text-xs text-[var(--text-tertiary)]">
                      {mapDisplayName(b.map)}
                      {b.rival ? ` · ${t("teamBoard.vsRival", { name: b.rival.name })}` : ""}
                      {b.createdBy?.name ? ` · ${b.createdBy.name}` : ""}
                    </span>
                    <span className="block font-mono text-[11px] text-[var(--text-tertiary)]">{formatDate(b.updatedAt)}</span>
                  </span>
                  {b.side && <Badge variant={b.side === "CT" ? "ct" : "t"}>{b.side}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
