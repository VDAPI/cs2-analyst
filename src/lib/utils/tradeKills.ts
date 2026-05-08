export interface TradeKillInputKill {
  id: string;
  roundId: string;
  tick: number;
  attackerSteamId: string;
  victimSteamId: string;
}

export interface TradeKillInput {
  kills: TradeKillInputKill[];
  teamBySteamId: Map<string, "CT" | "T">;
  tickRate: number;
  windowSeconds?: number;
}

export interface PerPlayerTradeStats {
  kills: number;
  deaths: number;
  tradeKills: number;
  deathsTraded: number;
}

export interface TradeKillResult {
  tradedKillIds: Set<string>;
  tradeKillIds: Set<string>;
  perPlayer: Map<string, PerPlayerTradeStats>;
}

export function detectTradeKills(input: TradeKillInput): TradeKillResult {
  const { kills, teamBySteamId, tickRate, windowSeconds = 5 } = input;
  const windowTicks = windowSeconds * tickRate;

  const killsByRound = new Map<string, TradeKillInputKill[]>();
  for (const k of kills) {
    const list = killsByRound.get(k.roundId);
    if (list) list.push(k);
    else killsByRound.set(k.roundId, [k]);
  }

  const tradedKillIds = new Set<string>();
  const tradeKillIds = new Set<string>();
  const perPlayer = new Map<string, PerPlayerTradeStats>();

  const ensure = (steamId: string): PerPlayerTradeStats => {
    let s = perPlayer.get(steamId);
    if (!s) {
      s = { kills: 0, deaths: 0, tradeKills: 0, deathsTraded: 0 };
      perPlayer.set(steamId, s);
    }
    return s;
  };

  for (const list of killsByRound.values()) {
    list.sort((a, b) => a.tick - b.tick);

    for (let i = 0; i < list.length; i++) {
      const death = list[i];
      ensure(death.attackerSteamId).kills++;
      ensure(death.victimSteamId).deaths++;

      const victimTeam = teamBySteamId.get(death.victimSteamId);
      if (!victimTeam) continue;

      for (let j = i + 1; j < list.length; j++) {
        const next = list[j];
        if (next.tick - death.tick > windowTicks) break;
        if (next.victimSteamId !== death.attackerSteamId) continue;
        const traderTeam = teamBySteamId.get(next.attackerSteamId);
        if (traderTeam !== victimTeam) continue;

        tradedKillIds.add(death.id);
        tradeKillIds.add(next.id);
        ensure(next.attackerSteamId).tradeKills++;
        ensure(death.victimSteamId).deathsTraded++;
        break;
      }
    }
  }

  return { tradedKillIds, tradeKillIds, perPlayer };
}
