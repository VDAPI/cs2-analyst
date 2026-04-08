import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Get first match
  const match = await prisma.match.findFirst({
    select: { id: true, map: true, scoreCT: true, scoreT: true },
  });

  if (!match) {
    console.log("No matches found");
    return;
  }

  console.log(`Match: ${match.id} (${match.map}) CT ${match.scoreCT} - ${match.scoreT} T\n`);

  // Get all kills
  const kills = await prisma.kill.findMany({
    where: { round: { matchId: match.id } },
    select: {
      attackerSteamId: true,
      attackerName: true,
      victimSteamId: true,
      victimName: true,
      attackerPosX: true,
      attackerPosY: true,
    },
  });
  console.log(`Total kills in DB: ${kills.length}`);

  // Get player roster
  const players = await prisma.matchPlayer.findMany({
    where: { matchId: match.id },
    select: { steamId: true, name: true, team: true },
  });

  console.log(`\nPlayer roster (${players.length} players):`);
  const teamBySteamId = new Map<string, string>();
  for (const p of players) {
    teamBySteamId.set(p.steamId, p.team);
    console.log(`  ${p.team} — ${p.name} (${p.steamId})`);
  }

  // Count kills by attacker team
  let ctKills = 0;
  let tKills = 0;
  let unknownTeam = 0;

  for (const k of kills) {
    const team = teamBySteamId.get(k.attackerSteamId);
    if (team === "CT") ctKills++;
    else if (team === "T") tKills++;
    else unknownTeam++;
  }

  console.log(`\nKills by attacker team (from matchPlayer.team):`);
  console.log(`  CT kills: ${ctKills}`);
  console.log(`  T kills:  ${tKills}`);
  console.log(`  Unknown:  ${unknownTeam}`);
  console.log(`  Total:    ${ctKills + tKills + unknownTeam}`);

  // Simulate API behavior for side=null (All)
  const allPoints = [];
  for (const k of kills) {
    const side = null; // "All" mode
    const team = teamBySteamId.get(k.attackerSteamId);
    if (side && team !== side) continue; // this should NOT filter when side=null
    allPoints.push({ x: k.attackerPosX, y: k.attackerPosY });
  }
  console.log(`\nAPI simulation (side=null, type=kills):`);
  console.log(`  Points returned: ${allPoints.length}`);

  // Check for duplicate steamIds (same player on both teams in different matches)
  const steamIdTeams = new Map<string, Set<string>>();
  for (const p of players) {
    if (!steamIdTeams.has(p.steamId)) steamIdTeams.set(p.steamId, new Set());
    steamIdTeams.get(p.steamId)!.add(p.team);
  }

  const multiTeam = Array.from(steamIdTeams.entries()).filter(([, teams]) => teams.size > 1);
  if (multiTeam.length > 0) {
    console.log(`\nPlayers on multiple teams:`);
    for (const [sid, teams] of multiTeam) {
      console.log(`  ${sid}: ${Array.from(teams).join(", ")}`);
    }
  }

  // Check: are attackerPosX/Y actually non-zero?
  const zeroPos = kills.filter(k => k.attackerPosX === 0 && k.attackerPosY === 0);
  console.log(`\nKills with (0,0) attacker position: ${zeroPos.length}`);

  // Get kills with round numbers to test team-swap logic
  const killsWithRound = await prisma.kill.findMany({
    where: { round: { matchId: match.id } },
    select: {
      attackerSteamId: true,
      attackerName: true,
      round: { select: { number: true } },
    },
  });

  // Test team-swap fix: count kills by in-game team per half
  function getInGameTeam(steamId: string, roundNumber: number): string | undefined {
    const dbTeam = teamBySteamId.get(steamId);
    if (!dbTeam) return undefined;
    if (roundNumber <= 12) return dbTeam === "CT" ? "T" : "CT";
    return dbTeam;
  }

  let firstHalfCT = 0, firstHalfT = 0, secondHalfCT = 0, secondHalfT = 0;
  for (const k of killsWithRound) {
    const inGameTeam = getInGameTeam(k.attackerSteamId, k.round.number);
    const isFirstHalf = k.round.number <= 12;
    if (inGameTeam === "CT") {
      if (isFirstHalf) firstHalfCT++; else secondHalfCT++;
    } else if (inGameTeam === "T") {
      if (isFirstHalf) firstHalfT++; else secondHalfT++;
    }
  }

  console.log(`\n=== Team-swap corrected kills ===`);
  console.log(`First half:  CT ${firstHalfCT} kills, T ${firstHalfT} kills`);
  console.log(`Second half: CT ${secondHalfCT} kills, T ${secondHalfT} kills`);
  console.log(`Total CT: ${firstHalfCT + secondHalfCT}, Total T: ${firstHalfT + secondHalfT}`);
  console.log(`Grand total: ${firstHalfCT + firstHalfT + secondHalfCT + secondHalfT}`);

  // Compare with OLD (buggy) team assignment
  let oldCT = 0, oldT = 0;
  for (const k of killsWithRound) {
    const dbTeam = teamBySteamId.get(k.attackerSteamId);
    if (dbTeam === "CT") oldCT++;
    else if (dbTeam === "T") oldT++;
  }
  console.log(`\n=== OLD (buggy) team assignment ===`);
  console.log(`CT kills (DB team): ${oldCT}`);
  console.log(`T kills (DB team):  ${oldT}`);
  console.log(`\nDifference: CT ${firstHalfCT + secondHalfCT - oldCT}, T ${firstHalfT + secondHalfT - oldT}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
