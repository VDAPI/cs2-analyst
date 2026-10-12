/**
 * "Download my data" (S29, GDPR art. 15 and 20): everything stored about one
 * user as one JSON document. Secrets are never exported: no password hash,
 * no OAuth tokens, no Steam auth code (only whether one is set), and push
 * subscriptions without their keys. Sampled replay data (RoundTicks, shots,
 * damage) is left out: it is large binary data about all ten players and
 * stays viewable in the 2D replay; the match, the player's own stats and
 * every finding about them are in.
 */
import type { PrismaClient } from "@prisma/client";

export const EXPORT_FORMAT_VERSION = 1;

export async function buildAccountExport(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      steamId: true,
      faceitId: true,
      faceitNickname: true,
      lastFaceitSync: true,
      plan: true,
      role: true,
      monthlyDemoLimit: true,
      locale: true,
      steamAuthCode: true,
      steamLastShareCode: true,
      lastSteamSync: true,
      publicProfile: true,
      publicSlug: true,
      stripeCustomerId: true,
      discordId: true,
      discordUsername: true,
      discordNotify: true,
      discordWebhookUrl: true,
      createdAt: true,
      updatedAt: true,
      password: true,
    },
  });
  if (!user) return null;
  // The channel webhook URL carries a token: export only that one is set.
  const { password, steamAuthCode, discordWebhookUrl, ...profile } = user;

  const [
    accounts,
    uploads,
    playerRows,
    faceitMatches,
    steamMatches,
    notifications,
    pushSubscriptions,
    goals,
    shares,
    mapNotes,
    trainingPlans,
    coachTexts,
    coachFeedback,
    lineupMastery,
    teams,
    tacticBoards,
    teamRivals,
    subscriptions,
    invoices,
  ] = await Promise.all([
    prisma.account.findMany({ where: { userId }, select: { provider: true, providerAccountId: true, type: true } }),
    prisma.demoUpload.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        status: true,
        source: true,
        faceitMatchId: true,
        error: true,
        keepDemo: true,
        demoDeletedAt: true,
        deletedAt: true,
        createdAt: true,
        match: {
          select: { id: true, map: true, date: true, duration: true, server: true, shareCode: true, scoreCT: true, scoreT: true },
        },
      },
    }),
    prisma.matchPlayer.findMany({
      where: { userId },
      include: { match: { select: { id: true, map: true, date: true, scoreCT: true, scoreT: true } } },
    }),
    prisma.faceitMatch.findMany({ where: { userId } }),
    prisma.steamMatch.findMany({ where: { userId } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true, lastUsedAt: true },
    }),
    prisma.goal.findMany({ where: { userId } }),
    prisma.share.findMany({ where: { userId } }),
    prisma.mapNote.findMany({ where: { userId } }),
    prisma.trainingPlan.findMany({ where: { userId } }),
    prisma.coachText.findMany({ where: { userId } }),
    prisma.coachFeedback.findMany({ where: { userId } }),
    prisma.lineupMastery.findMany({ where: { userId } }),
    prisma.teamMember.findMany({ where: { userId }, include: { team: { select: { id: true, name: true } } } }),
    prisma.tacticBoard.findMany({ where: { createdById: userId } }),
    prisma.teamRival.findMany({ where: { createdById: userId }, select: { id: true, teamId: true, name: true, steamIds: true, notes: true, createdAt: true } }),
    prisma.billingSubscription.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.billingInvoice.findMany({ where: { userId }, orderBy: { created: "asc" } }),
  ]);

  // Findings about the player: in their own uploads, and wherever they
  // played under their SteamID.
  const matchIds = [
    ...new Set([
      ...uploads.map((u) => u.match?.id).filter((id): id is string => Boolean(id)),
      ...playerRows.map((p) => p.matchId),
    ]),
  ];
  const steamIds = [...new Set(playerRows.map((p) => p.steamId).concat(user.steamId ? [user.steamId] : []))];
  const findings =
    matchIds.length && steamIds.length
      ? await prisma.finding.findMany({
          where: { matchId: { in: matchIds }, steamId: { in: steamIds } },
          orderBy: [{ matchId: "asc" }, { roundNumber: "asc" }, { tick: "asc" }],
          select: {
            matchId: true,
            steamId: true,
            type: true,
            category: true,
            severity: true,
            roundNumber: true,
            tick: true,
            roundTime: true,
            costly: true,
            values: true,
            detail: true,
            advice: true,
          },
        })
      : [];

  return {
    format: "cs2-analyst-export",
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: {
      ...profile,
      hasPassword: Boolean(password),
      steamAuthCodeSet: Boolean(steamAuthCode),
      discordWebhookSet: Boolean(discordWebhookUrl),
    },
    linkedAccounts: accounts,
    teams: teams.map((t) => ({ team: t.team, role: t.role, steamId: t.steamId, joinedAt: t.joinedAt })),
    tacticBoards,
    teamRivals,
    uploads,
    playerStats: playerRows,
    findings,
    faceitMatches,
    steamMatches,
    notifications,
    pushSubscriptions,
    goals,
    shares,
    mapNotes,
    trainingPlans,
    coachTexts,
    coachFeedback,
    lineupMastery,
    billing: { subscriptions, invoices },
  };
}
