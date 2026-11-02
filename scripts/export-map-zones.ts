/**
 * Prints the positions assigned on /callouts (MapZone, MapCallout) as the JSON
 * of prisma/map-zones.json, which `npm run setup:local` imports into a fresh
 * database. From Git Bash, with the app running:
 *
 *   docker compose exec -T app npm run -s zones:export > prisma/map-zones.json
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [zones, callouts] = await Promise.all([
    prisma.mapZone.findMany({
      orderBy: [{ map: "asc" }, { createdAt: "asc" }],
      select: { map: true, name: true, points: true, ctSpot: true, laneA: true, laneB: true },
    }),
    prisma.mapCallout.findMany({
      orderBy: [{ map: "asc" }, { place: "asc" }],
      select: { map: true, place: true, name: true, ctSpot: true, laneA: true, laneB: true },
    }),
  ]);
  console.log(JSON.stringify({ zones, callouts }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
