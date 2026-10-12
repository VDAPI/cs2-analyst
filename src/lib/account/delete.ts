/**
 * "Delete my account" (S29, GDPR art. 17): removes the user and everything
 * that is theirs in one go. Demo files (disk or R2) first, then the matches
 * of their uploads (rounds, replay data, analyses, findings, norm samples,
 * shares and notes cascade with Match), the uploads, team memberships, and
 * finally the user row, which cascades accounts, sessions, FACEIT / Steam
 * history, notifications, push subscriptions, goals, shares, notes, plans,
 * AI coach texts, feedback and lineup marks. Their MatchPlayer rows in other
 * players' matches lose the link to the account (onDelete SetNull); the stats
 * stay part of that other player's match.
 *
 * Analyses still in flight need nothing special: the workers skip, or fail
 * and clean up, an upload whose row is gone.
 */
import type { PrismaClient } from "@prisma/client";
import { join } from "node:path";
import { deleteStoredDemo, LOCAL_DEMO_DIR } from "@/lib/storage/demo-store";

export interface DeleteAccountResult {
  uploads: number;
  matches: number;
  /** Demo files that could not be removed (logged; the rows are gone anyway). */
  demoErrors: number;
}

/** Text the player types to confirm (either language); see the settings danger zone. */
export const DELETE_CONFIRM_WORDS = ["USUŃ", "USUN", "DELETE"] as const;

export function isDeleteConfirmation(text: string): boolean {
  const t = text.trim().toUpperCase();
  return (DELETE_CONFIRM_WORDS as readonly string[]).includes(t);
}

export async function deleteAccount(prisma: PrismaClient, userId: string): Promise<DeleteAccountResult> {
  const uploads = await prisma.demoUpload.findMany({
    where: { userId },
    select: { id: true, fileUrl: true, demoDeletedAt: true, matchId: true },
  });

  let demoErrors = 0;
  for (const u of uploads) {
    // The stored demo, plus the local file a download or upload in progress
    // writes before it has a fileUrl.
    const targets = new Set<string>([join(LOCAL_DEMO_DIR, `${u.id}.dem`)]);
    if (!u.demoDeletedAt && u.fileUrl) targets.add(u.fileUrl);
    for (const target of targets) {
      await deleteStoredDemo(target).catch((err) => {
        demoErrors++;
        console.error(`[account] deleting demo of upload=${u.id} failed`, err);
      });
    }
  }

  const matchIds = uploads.map((u) => u.matchId).filter((id): id is string => Boolean(id));
  await prisma.$transaction([
    // FaceitMatch / SteamMatch rows point at uploads; they go with the user,
    // but the uploads go first, so unlink them.
    prisma.faceitMatch.updateMany({ where: { userId }, data: { uploadId: null } }),
    prisma.steamMatch.updateMany({ where: { userId }, data: { uploadId: null } }),
    prisma.demoUpload.deleteMany({ where: { userId } }),
    prisma.match.deleteMany({ where: { id: { in: matchIds } } }),
    prisma.teamMember.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return { uploads: uploads.length, matches: matchIds.length, demoErrors };
}
