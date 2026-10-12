/**
 * Who may read a match's replay data (ticks, kills, grenades, bombs, notes):
 * the uploader, or anyone holding a live share link of that match (S16). A
 * moment link only opens its own round. Route handlers take the token from
 * `?share=`.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { isShareToken } from "./share";

export interface MatchAccess {
  /** Signed-in uploader; null when reading through a share link. */
  ownerId: string | null;
  /** The only round a moment link may read; null = every round. */
  round: number | null;
  /** The share link used, when not the owner. */
  shareId: string | null;
  /** Owner of the match (the one whose notes a share shows). */
  uploaderId: string;
}

export async function getMatchAccess(req: Request, matchId: string): Promise<MatchAccess | null> {
  const upload = await prisma.demoUpload.findFirst({
    where: { matchId, deletedAt: null },
    select: { userId: true },
  });
  if (!upload) return null;

  const session = await getServerSession(authOptions);
  if (session?.user?.id && session.user.id === upload.userId) {
    return { ownerId: upload.userId, round: null, shareId: null, uploaderId: upload.userId };
  }

  const token = new URL(req.url).searchParams.get("share");
  if (!isShareToken(token)) return null;
  const share = await prisma.share.findUnique({ where: { token } });
  if (!share || share.revokedAt || share.matchId !== matchId) return null;
  return {
    ownerId: null,
    round: share.kind === "moment" ? share.roundNumber : null,
    shareId: share.id,
    uploaderId: upload.userId,
  };
}

/** A round the access may read. */
export function roundAllowed(access: MatchAccess, round: number): boolean {
  return access.round == null || access.round === round;
}
