export interface MultiKill {
  steamId: string;
  playerName: string;
  count: number;
  type: "3k" | "4k" | "ace";
  weapons: string[];
  headshots: number;
  roundNumber: number;
}

interface KillInput {
  attackerSteamId: string;
  attackerName: string;
  weapon: string;
  headshot: boolean;
}

interface RoundInput {
  number: number;
  kills: KillInput[];
}

function classifyCount(count: number): "3k" | "4k" | "ace" | null {
  if (count >= 5) return "ace";
  if (count === 4) return "4k";
  if (count === 3) return "3k";
  return null;
}

export function detectMultiKills(rounds: RoundInput[]): MultiKill[] {
  const results: MultiKill[] = [];

  for (const round of rounds) {
    const grouped = new Map<
      string,
      { name: string; weapons: string[]; headshots: number }
    >();

    for (const kill of round.kills) {
      const existing = grouped.get(kill.attackerSteamId);
      if (existing) {
        existing.weapons.push(kill.weapon);
        if (kill.headshot) existing.headshots++;
      } else {
        grouped.set(kill.attackerSteamId, {
          name: kill.attackerName,
          weapons: [kill.weapon],
          headshots: kill.headshot ? 1 : 0,
        });
      }
    }

    for (const [steamId, data] of grouped) {
      const type = classifyCount(data.weapons.length);
      if (!type) continue;

      results.push({
        steamId,
        playerName: data.name,
        count: data.weapons.length,
        type,
        weapons: data.weapons,
        headshots: data.headshots,
        roundNumber: round.number,
      });
    }
  }

  return results;
}

/** Index multi-kills by round number for quick lookup */
export function multiKillsByRound(
  multiKills: MultiKill[]
): Map<number, MultiKill[]> {
  const map = new Map<number, MultiKill[]>();
  for (const mk of multiKills) {
    const existing = map.get(mk.roundNumber);
    if (existing) existing.push(mk);
    else map.set(mk.roundNumber, [mk]);
  }
  return map;
}
