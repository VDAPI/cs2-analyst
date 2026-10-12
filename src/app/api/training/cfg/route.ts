import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getMapLineups } from "@/lib/analysis/persist-utility";
import type { GrenadeKind } from "@/lib/analysis/utility";
import { planContent } from "@/lib/coach/persist";
import { weekStartOf } from "@/lib/coach/plan";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { cfgFileName, lineupPracticeCfg, MAX_CFG_LINEUPS, routineCfg } from "@/lib/training/cfg";
import { loadMastered, loadRoutineLineups } from "@/lib/training/persist";
import { buildRoutine, planDayOf } from "@/lib/training/routine";
import { formatDate } from "@/lib/utils/formatters";
import { MAP_CONFIGS } from "@/lib/utils/maps";
import { mapDisplayName } from "@/lib/utils/mapNames";

const TYPES: GrenadeKind[] = ["SMOKE", "FLASH", "MOLOTOV", "HE"];

function file(name: string, body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * GET /api/training/cfg — downloadable CS2 configs (S22).
 * - `?kind=lineups&map=de_mirage[&type=SMOKE][&keys=k1,k2][&all=1]`: grenade
 *   practice config with one alias per lineup (default: the ones not mastered yet).
 * - `?kind=routine[&day=0-6]`: this week's plan day (default: today) as a config.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const url = new URL(req.url);
  const { t, locale } = await getT();
  const today = formatDate(new Date().toISOString());

  if (url.searchParams.get("kind") === "routine") {
    const now = new Date();
    const dayParam = Number(url.searchParams.get("day"));
    const day = Number.isInteger(dayParam) && dayParam >= 0 && dayParam <= 6 && url.searchParams.has("day") ? dayParam : planDayOf(now);
    const row = await prisma.trainingPlan.findUnique({ where: { userId_weekStart: { userId, weekStart: weekStartOf(now) } } });
    const plan = row ? planContent(row) : null;
    if (!plan) return NextResponse.json({ error: "No plan this week" }, { status: 404 });
    const mapName = plan.map ? mapDisplayName(plan.map) : null;
    const routine = buildRoutine(plan, day, locale, mapName, t);
    const lineups = await loadRoutineLineups(prisma, userId, plan.map, routine);
    const dayDate = new Date(`${plan.weekStart}T12:00:00Z`);
    dayDate.setUTCDate(dayDate.getUTCDate() + day);
    return file(
      cfgFileName("routine"),
      routineCfg({ routine, dayName: t(`coach.day${day}` as MessageKey), date: formatDate(dayDate), mapName, lineups, locale })
    );
  }

  const map = url.searchParams.get("map") ?? "";
  if (!MAP_CONFIGS[map]) return NextResponse.json({ error: "Unknown map" }, { status: 400 });
  const type = url.searchParams.get("type") as GrenadeKind | null;
  const keys = url.searchParams.get("keys")?.split(",").filter(Boolean) ?? null;
  const [all, mastered] = await Promise.all([getMapLineups(prisma, map), loadMastered(prisma, userId, map)]);
  let lineups = all.filter((l) => l.type !== "DECOY" && (!type || !TYPES.includes(type) || l.type === type));
  if (keys) {
    const order = new Map(keys.map((k, i) => [k, i]));
    lineups = lineups.filter((l) => order.has(l.key)).sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  } else if (url.searchParams.get("all") !== "1") {
    lineups = lineups.filter((l) => !mastered.has(l.key));
  }
  return file(
    cfgFileName("lineups", map),
    lineupPracticeCfg({ map, mapName: mapDisplayName(map), lineups: lineups.slice(0, MAX_CFG_LINEUPS), locale, date: today })
  );
}
