import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ownMatchWhere } from "@/lib/sharing/access";
import { getT } from "@/lib/i18n/server";
import { getMatchTeamReport } from "@/lib/team/load";
import { roundsCsv } from "@/lib/team/breakdown-text";

/** GET /api/matches/[matchId]/team-breakdown?side=CT|T — the team breakdown's rounds as CSV. */
export async function GET(req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await ctx.params;
  const where = await ownMatchWhere(matchId, { allowAdmin: true, allowTeam: true });
  if (!where || !(await prisma.match.findFirst({ where, select: { id: true } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const side = new URL(req.url).searchParams.get("side") === "T" ? "T" : "CT";
  const report = await getMatchTeamReport(prisma, matchId, side);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { t } = await getT();
  return new NextResponse(roundsCsv(t, report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analiza-druzyny-${report.matches[0]?.map ?? "mecz"}-${side}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
