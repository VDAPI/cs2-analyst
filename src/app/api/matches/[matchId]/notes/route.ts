import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getMatchAccess, roundAllowed } from "@/lib/sharing/access";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { MAX_NOTE_LENGTH } from "@/lib/sharing/share";

const MAX_NOTES_PER_MATCH = 200;

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/notes?round=N[&share=token] — the uploader's map
 * notes (S16), for one round or the whole match. A moment link sees its round.
 */
export async function GET(req: Request, { params }: Props) {
  const { matchId } = await params;
  const access = await getMatchAccess(req, matchId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const roundParam = new URL(req.url).searchParams.get("round");
  const round = roundParam ? parseInt(roundParam, 10) : access.round;
  if (round != null && !roundAllowed(access, round)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The example analysis (/demo) shows the report and clips, not the owner's notes.
  if (access.demo) return NextResponse.json({ notes: [] });

  const notes = await prisma.mapNote.findMany({
    where: { matchId, userId: access.uploaderId, ...(round != null ? { roundNumber: round } : {}) },
    orderBy: [{ roundNumber: "asc" }, { tick: "asc" }],
    select: { id: true, roundNumber: true, tick: true, x: true, y: true, text: true },
  });
  return NextResponse.json({ notes });
}

const schema = z.object({
  round: z.number().int().min(1),
  tick: z.number().int().min(0),
  x: z.number().finite(),
  y: z.number().finite(),
  text: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
});

/** POST /api/matches/[matchId]/notes — pin a note on the map (uploader only). */
export async function POST(req: Request, { params }: Props) {
  const { matchId } = await params;
  const access = await getMatchAccess(req, matchId);
  if (!access?.ownerId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limited = await rateLimit("write", access.ownerId);
  if (limited) return limited;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid note" }, { status: 400 });
  const { round, tick, x, y, text } = body.data;

  const [roundRow, count] = await Promise.all([
    prisma.round.findUnique({ where: { matchId_number: { matchId, number: round } }, select: { id: true } }),
    prisma.mapNote.count({ where: { matchId, userId: access.ownerId } }),
  ]);
  if (!roundRow) return NextResponse.json({ error: "Round not found" }, { status: 400 });
  if (count >= MAX_NOTES_PER_MATCH) return NextResponse.json({ error: "Too many notes" }, { status: 409 });

  const note = await prisma.mapNote.create({
    data: { userId: access.ownerId, matchId, roundNumber: round, tick, x, y, text },
    select: { id: true, roundNumber: true, tick: true, x: true, y: true, text: true },
  });
  return NextResponse.json({ note });
}
