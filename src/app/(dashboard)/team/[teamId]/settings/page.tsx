import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { ensureInviteCode, getTeamContext, memberCandidates } from "@/lib/team/load";
import { canManageContent, canManageTeam } from "@/lib/team/roster";
import { TeamHeader } from "@/components/team/team-header";
import { TeamSettings } from "@/components/team/team-settings";

interface Props {
  params: Promise<{ teamId: string }>;
}

/** /team/[teamId]/settings — invite link, members and roles, who is who in the demos. */
export default async function TeamSettingsPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { teamId } = await params;
  const { t } = await getT();
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) notFound();

  const inviteCode = canManageContent(ctx.role) ? await ensureInviteCode(prisma, teamId, ctx.team.inviteCode) : null;
  const candidates = await memberCandidates(prisma, session.user.id);
  // Names of the roster's SteamIDs as they appear in demos (latest first).
  const ids = [...new Set([...ctx.roster, ...candidates.map((c) => c.steamId)])];
  const seen = ids.length
    ? await prisma.matchPlayer.findMany({
        where: { steamId: { in: ids } },
        orderBy: { match: { date: "desc" } },
        distinct: ["steamId"],
        select: { steamId: true, name: true },
      })
    : [];
  const inGameName = Object.fromEntries(seen.map((p) => [p.steamId, p.name]));

  return (
    <div className="min-w-0 space-y-6">
      <TeamHeader team={ctx.team} active="settings" title={t("team.settingsTitle")} description={t("team.settingsDescription")} />
      <TeamSettings
        teamId={teamId}
        team={{ name: ctx.team.name, tag: ctx.team.tag, extraSteamIds: ctx.team.extraSteamIds }}
        inviteCode={inviteCode}
        role={ctx.role}
        meId={ctx.memberId}
        canManage={canManageTeam(ctx.role)}
        canManageRoster={canManageContent(ctx.role)}
        members={ctx.members.map((m) => ({
          id: m.id,
          name: m.user.name ?? inGameName[m.steamId ?? m.user.steamId ?? ""] ?? null,
          image: m.user.image,
          role: m.role,
          steamId: m.steamId,
          accountSteamId: m.user.steamId,
          inGameName: inGameName[m.steamId ?? m.user.steamId ?? ""] ?? null,
        }))}
        candidates={candidates}
        inGameName={inGameName}
      />
    </div>
  );
}
