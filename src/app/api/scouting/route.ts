import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { FaceitApiError } from "@/lib/faceit/api";
import { parseRoomInput } from "@/lib/scouting/analysis";
import { RoomNotFoundError, scoutRoom } from "@/lib/scouting/scout";

const bodySchema = z.object({ room: z.string().min(1).max(500) });

/**
 * POST /api/scouting — scout a FACEIT match room.
 *
 * Body: { room: link to the room, or its match ID }.
 * Returns a ScoutReport: both rosters with level, ELO, lifetime and recent
 * form, per-map team strength and the room's map pool. The veto suggestion
 * is computed on the client so the player can flip which side is theirs.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Zaloguj się, aby skautować rywali." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  const matchId = parsed.success ? parseRoomInput(parsed.data.room) : null;
  if (!matchId) {
    return NextResponse.json(
      { error: "To nie wygląda na link do pokoju FACEIT. Wklej adres w stylu faceit.com/pl/cs2/room/1-…" },
      { status: 400 }
    );
  }

  if (!process.env.FACEIT_API_KEY) {
    return NextResponse.json(
      { error: "Scouting jest chwilowo niedostępny: serwer nie ma klucza FACEIT API." },
      { status: 503 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { faceitId: true },
  });

  try {
    const report = await scoutRoom(prisma, matchId, user?.faceitId ?? null);
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof RoomNotFoundError) {
      return NextResponse.json({ error: "Nie znaleziono takiego meczu na FACEIT." }, { status: 404 });
    }
    if (err instanceof FaceitApiError && err.status === 429) {
      return NextResponse.json(
        { error: "FACEIT ogranicza teraz liczbę zapytań. Spróbuj ponownie za minutę." },
        { status: 503 }
      );
    }
    console.error("[scouting] failed:", matchId, err);
    return NextResponse.json({ error: "FACEIT nie odpowiedział. Spróbuj ponownie za chwilę." }, { status: 502 });
  }
}
