/**
 * Leaving a team (S17), shared by "leave", the owner removing a member and
 * account deletion: the owner's role passes to the next member (a coach
 * first, then the longest member), and a team with nobody left is deleted
 * with its rivals and boards.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { nextOwner } from "./roster";

type Tx = Prisma.TransactionClient | PrismaClient;

export async function removeMember(tx: Tx, teamId: string, userId: string): Promise<"left" | "deleted"> {
  const members = await tx.teamMember.findMany({ where: { teamId }, select: { id: true, userId: true, role: true, joinedAt: true } });
  const leaving = members.find((m) => m.userId === userId);
  if (!leaving) return "left";
  const heir = leaving.role === "OWNER" ? nextOwner(members, userId) : null;
  if (members.length <= 1) {
    await tx.team.delete({ where: { id: teamId } });
    return "deleted";
  }
  await tx.teamMember.delete({ where: { id: leaving.id } });
  if (heir && !members.some((m) => m.role === "OWNER" && m.userId !== userId)) {
    await tx.teamMember.update({ where: { id: heir.id }, data: { role: "OWNER" } });
  }
  return "left";
}

/** Every team of a user, left one by one (account deletion). */
export async function leaveAllTeams(tx: Tx, userId: string): Promise<void> {
  const rows = await tx.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  for (const r of rows) await removeMember(tx, r.teamId, userId);
}
