import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ChevronRight, Shield } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { listUserTeams } from "@/lib/team/load";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { CreateTeamForm, JoinTeamForm } from "@/components/team/team-forms";
import { ROLE_KEY } from "@/components/team/labels";

interface Props {
  searchParams: Promise<{ all?: string }>;
}

/** /team — the user's teams; with exactly one, straight to its dashboard. */
export default async function TeamsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { all } = await searchParams;
  const { t } = await getT();
  const teams = await listUserTeams(prisma, session.user.id);
  if (teams.length === 1 && !all) redirect(`/team/${teams[0].team.id}`);

  return (
    <div className="min-w-0 space-y-8">
      <PageHeader eyebrow={t("team.eyebrow")} title={t("team.title")} description={t("team.description")} />

      {teams.length > 0 && (
        <section aria-labelledby="druzyny" className="space-y-3">
          <SectionTitle>
            <span id="druzyny">{t("team.yourTeams")}</span>
          </SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2">
            {teams.map(({ team, role }) => (
              <li key={team.id}>
                <Link
                  href={`/team/${team.id}`}
                  className="flex min-h-16 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 transition-colors hover:border-[var(--border-hover)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] font-display text-sm font-bold text-[var(--accent)]">
                    {team.tag?.slice(0, 3) || <Shield className="h-5 w-5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[var(--text-primary)]">{team.name}</span>
                    <span className="block text-xs text-[var(--text-tertiary)]">
                      {t("team.listCounts", { members: team._count.members, rivals: team._count.rivals, boards: team._count.boards })}
                    </span>
                  </span>
                  <Badge variant={role === "OWNER" ? "lime" : "neutral"}>{t(ROLE_KEY[role])}</Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">{t("team.createTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">{t("team.createBody")}</p>
          </div>
          <CreateTeamForm />
        </Card>
        <Card className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">{t("team.joinTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">{t("team.joinBody")}</p>
          </div>
          <JoinTeamForm />
        </Card>
      </div>

      <Card className="space-y-2">
        <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("team.howTitle")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
          <li>{t("team.how1")}</li>
          <li>{t("team.how2")}</li>
          <li>{t("team.how3")}</li>
          <li>{t("team.how4")}</li>
        </ul>
      </Card>
    </div>
  );
}
