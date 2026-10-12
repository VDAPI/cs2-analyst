import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ChevronRight, Swords } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { findTeamMatches, getTeamContext } from "@/lib/team/load";
import type { AntiStratReport } from "@/lib/team/antistrat";
import { formatDate } from "@/lib/utils/formatters";
import { EmptyState, SectionTitle } from "@/components/ui";
import { TeamHeader } from "@/components/team/team-header";
import { RivalCreate } from "@/components/team/rival-create";

interface Props {
  params: Promise<{ teamId: string }>;
}

/** /team/[teamId]/rivals — the rivals the team scouts, and adding one. */
export default async function RivalsPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { teamId } = await params;
  const { t } = await getT();
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) notFound();

  const [rivals, teamMatches, own] = await Promise.all([
    prisma.teamRival.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, steamIds: true, report: true, createdAt: true, _count: { select: { boards: true } } },
    }),
    findTeamMatches(prisma, ctx, 15),
    prisma.match.findMany({
      where: { upload: { userId: session.user.id, deletedAt: null, pro: false, status: "COMPLETED" } },
      orderBy: { date: "desc" },
      take: 20,
      select: { id: true, map: true, date: true, players: { select: { name: true, team: true } } },
    }),
  ]);
  const names = await prisma.match.findMany({
    where: { id: { in: teamMatches.map((m) => m.id) } },
    select: { id: true, players: { select: { name: true, team: true } } },
  });
  const playersOf = new Map(names.map((m) => [m.id, m.players]));
  const teamIds = new Set(teamMatches.map((m) => m.id));

  return (
    <div className="min-w-0 space-y-8">
      <TeamHeader team={ctx.team} active="rivals" title={t("rivals.title")} description={t("rivals.description")} />

      <section aria-labelledby="rywale" className="space-y-3">
        <SectionTitle>
          <span id="rywale">{t("rivals.listTitle")}</span>
        </SectionTitle>
        {rivals.length === 0 ? (
          <EmptyState icon={Swords} title={t("rivals.emptyTitle")} description={t("rivals.emptyBody")} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rivals.map((r) => {
              const report = r.report as unknown as AntiStratReport | null;
              return (
                <li key={r.id}>
                  <Link
                    href={`/team/${teamId}/rivals/${r.id}`}
                    className="flex min-h-16 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 transition-colors hover:border-[var(--border-hover)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--mistake-muted)] text-[var(--mistake)]">
                      <Swords className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--text-primary)]">{r.name}</span>
                      <span className="block text-xs text-[var(--text-tertiary)]">
                        {t("rivals.listCounts", { players: r.steamIds.length, matches: report?.matches.length ?? "—", boards: r._count.boards })}
                      </span>
                    </span>
                    <span className="hidden font-mono text-xs text-[var(--text-tertiary)] sm:block">{formatDate(r.createdAt)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="dodaj-rywala" className="space-y-3">
        <SectionTitle>
          <span id="dodaj-rywala">{t("rivals.addTitle")}</span>
        </SectionTitle>
        <RivalCreate
          teamId={teamId}
          teamMatches={teamMatches.map((m) => {
            const opp = m.teamSide === "CT" ? "T" : "CT";
            return {
              matchId: m.id,
              map: m.map,
              date: m.date.toISOString(),
              side: opp,
              names: (playersOf.get(m.id) ?? []).filter((p) => p.team === opp).map((p) => p.name),
            };
          })}
          libraryMatches={own
            .filter((m) => !teamIds.has(m.id))
            .map((m) => ({
              matchId: m.id,
              map: m.map,
              date: m.date.toISOString(),
              ct: m.players.filter((p) => p.team === "CT").map((p) => p.name),
              t: m.players.filter((p) => p.team === "T").map((p) => p.name),
            }))}
        />
      </section>
    </div>
  );
}
