import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { getTeamContext } from "@/lib/team/load";
import { emptyBoard, parseBoardData } from "@/lib/team/board";
import { boardMaps } from "@/lib/team/maps";
import { canEditItem } from "@/lib/team/roster";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { TeamHeader } from "@/components/team/team-header";
import { TacticBoard } from "@/components/team/tactic-board";

interface Props {
  params: Promise<{ teamId: string; boardId: string }>;
}

/** /team/[teamId]/boards/[boardId] — the tactic board editor (read-only for members who can't edit it). */
export default async function BoardPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { teamId, boardId } = await params;
  const { t } = await getT();
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) notFound();
  const board = await prisma.tacticBoard.findFirst({
    where: { id: boardId, teamId },
    select: {
      id: true,
      name: true,
      map: true,
      side: true,
      data: true,
      updatedAt: true,
      createdById: true,
      rival: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!board) notFound();
  const canEdit = canEditItem(ctx.role, session.user.id, board.createdById);

  return (
    <div className="min-w-0 space-y-6">
      <TeamHeader
        team={ctx.team}
        active="boards"
        title={board.name}
        back={{ href: `/team/${teamId}/boards`, label: t("teamBoard.back") }}
        description={
          <>
            {mapDisplayName(board.map)}
            {board.side ? ` · ${board.side}` : ""}
            {board.rival && (
              <>
                {" · "}
                <Link href={`/team/${teamId}/rivals/${board.rival.id}`} className="text-[var(--accent-hover)] hover:underline">
                  {t("teamBoard.vsRival", { name: board.rival.name })}
                </Link>
              </>
            )}
            {board.createdBy?.name ? ` · ${t("teamBoard.by", { name: board.createdBy.name })}` : ""}
          </>
        }
      />
      <TacticBoard
        teamId={teamId}
        board={{
          id: board.id,
          name: board.name,
          map: board.map,
          side: board.side === "CT" || board.side === "T" ? board.side : null,
          data: parseBoardData(board.data) ?? emptyBoard(),
          updatedAt: board.updatedAt.toISOString(),
        }}
        canEdit={canEdit}
        maps={boardMaps()}
      />
    </div>
  );
}
