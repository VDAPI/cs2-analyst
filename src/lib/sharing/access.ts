/**
 * Who may read a match's replay data (ticks, kills, grenades, bombs, notes):
 * the uploader, or anyone holding a live share link of that match (S16). A
 * moment link only opens its own round. Route handlers take the token from
 * `?share=`. Pro demos (the pro pool, S13) are readable by every signed-in
 * player: "co zrobiłby pro" shows their rounds as 2D clips (S14).
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";
import type { Prisma } from "@prisma/client";
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
    select: { userId: true, pro: true },
  });
  if (!upload) return null;

  const session = await getServerSession(authOptions);
  if (session?.user?.id && session.user.id === upload.userId) {
    return { ownerId: upload.userId, round: null, shareId: null, uploaderId: upload.userId };
  }
  if (upload.pro && session?.user?.id) {
    return { ownerId: null, round: null, shareId: null, uploaderId: upload.userId };
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

/**
 * Filter for a dashboard page of one match (/matches, /replay, /heatmaps):
 * only the signed-in uploader's live analysis; null when nobody is signed
 * in. Share links never open these pages: they have their own public view
 * (/s/[token]) and read replay data through `getMatchAccess`. With
 * `allowAdmin`, an admin may open any match (the admin analyses list links
 * to the match page).
 */
export async function ownMatchWhere(
  matchId: string,
  opts: { allowAdmin?: boolean } = {}
): Promise<Prisma.MatchWhereInput | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  if (opts.allowAdmin && (await getAdminUser())) return { id: matchId };
  return { id: matchId, upload: { userId: session.user.id, deletedAt: null } };
}

/** A round the access may read. */
export function roundAllowed(access: MatchAccess, round: number): boolean {
  return access.round == null || access.round === round;
}
