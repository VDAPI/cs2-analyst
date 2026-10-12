import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Users } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { isInviteCode } from "@/lib/team/roster";
import { Card, PageHeader } from "@/components/ui";
import { JoinTeamForm } from "@/components/team/team-forms";

interface Props {
  params: Promise<{ code: string }>;
}

/** /team/join/<code> — the invite link: shows the team, one click joins it. */
export default async function JoinTeamPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  const { code } = await params;
  // The middleware sends signed-out visitors to /login and back here.
  if (!session?.user?.id) redirect("/login");
  if (!isInviteCode(code)) notFound();
  const { t } = await getT();
  const team = await prisma.team.findUnique({
    where: { inviteCode: code },
    select: { id: true, name: true, tag: true, _count: { select: { members: true } }, members: { where: { userId: session.user.id }, select: { id: true } } },
  });
  if (!team) notFound();
  if (team.members.length > 0) redirect(`/team/${team.id}`);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader eyebrow={t("team.eyebrow")} title={t("team.inviteTitle")} />
      <Card className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]">
          <Users className="h-7 w-7" aria-hidden />
        </div>
        <div>
          <p className="font-display text-xl font-semibold text-[var(--text-primary)]">
            {team.tag ? `[${team.tag}] ` : ""}
            {team.name}
          </p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">{t("team.inviteMembers", { n: team._count.members })}</p>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{t("team.inviteBody")}</p>
        <div className="flex justify-center">
          <JoinTeamForm initialCode={code} compact />
        </div>
      </Card>
    </div>
  );
}
