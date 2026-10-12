/**
 * Client loader for one round of 2D replay data (frames, kills, utility,
 * bomb), shared by the replay viewer and the 2D clips on finding cards.
 */
import type {
  KillEvent,
  ReplayBombEvent,
  ReplayGrenadeEvent,
  TickFrame,
} from "@/stores/replay-store";

export interface RoundData {
  frames: TickFrame[];
  kills: KillEvent[];
  grenadeEvents: ReplayGrenadeEvent[];
  bombEvents: ReplayBombEvent[];
  startTick: number;
  endTick: number;
}

interface GrenadeJson {
  tick: number;
  type: string;
  landPos: { x: number; y: number };
  throwPos: { x: number; y: number };
  duration: number | null;
  throwerName: string;
}

interface BombJson {
  tick: number;
  type: string;
  x: number;
  y: number;
  site: string | null;
}

export async function fetchRoundData(
  matchId: string,
  round: number,
  /** `share`: a public link's token, for viewers who don't own the match (S16). */
  opts: { interval?: number; from?: number; to?: number; signal?: AbortSignal; share?: string | null } = {}
): Promise<RoundData> {
  const q = new URLSearchParams({ round: String(round), interval: String(opts.interval ?? 32) });
  if (opts.from != null) q.set("from", String(Math.round(opts.from)));
  if (opts.to != null) q.set("to", String(Math.round(opts.to)));
  const { signal } = opts;
  const rq = new URLSearchParams({ round: String(round) });
  if (opts.share) {
    q.set("share", opts.share);
    rq.set("share", opts.share);
  }

  const [ticksRes, killsRes, grenadesRes, bombsRes] = await Promise.all([
    fetch(`/api/matches/${matchId}/ticks?${q}`, { signal }),
    fetch(`/api/matches/${matchId}/kills?${rq}`, { signal }),
    fetch(`/api/matches/${matchId}/grenades?${rq}`, { signal }),
    fetch(`/api/matches/${matchId}/bombs?${rq}`, { signal }),
  ]);
  if (!ticksRes.ok) throw new Error("Failed to load tick data");

  const ticksData = await ticksRes.json();
  const killsData = killsRes.ok ? await killsRes.json() : { kills: [] };
  const grenadesData = grenadesRes.ok ? await grenadesRes.json() : { grenades: [] };
  const bombsData = bombsRes.ok ? await bombsRes.json() : { bombs: [] };

  return {
    frames: ticksData.ticks ?? [],
    kills: killsData.kills ?? [],
    grenadeEvents: ((grenadesData.grenades ?? []) as GrenadeJson[]).map((g) => ({
      tick: g.tick,
      type: g.type as ReplayGrenadeEvent["type"],
      landX: g.landPos.x,
      landY: g.landPos.y,
      throwX: g.throwPos.x,
      throwY: g.throwPos.y,
      duration: g.duration,
      throwerName: g.throwerName,
    })),
    bombEvents: ((bombsData.bombs ?? []) as BombJson[]).map((b) => ({
      tick: b.tick,
      type: b.type as ReplayBombEvent["type"],
      x: b.x,
      y: b.y,
      site: b.site,
    })),
    startTick: ticksData.startTick,
    endTick: ticksData.endTick,
  };
}
