import { create } from "zustand";

export interface PlayerSnapshot {
  steamId: string;
  name: string;
  team: "CT" | "T";
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  isAlive: boolean;
  weapon: string;
}

export interface TickFrame {
  tick: number;
  players: PlayerSnapshot[];
}

export interface KillEvent {
  tick: number;
  attackerName: string;
  victimName: string;
  victimX: number;
  victimY: number;
  weapon: string;
  headshot: boolean;
}

export interface ReplayGrenadeEvent {
  tick: number;
  type: "SMOKE" | "FLASH" | "HE" | "MOLOTOV" | "INCENDIARY";
  landX: number;
  landY: number;
  throwX: number;
  throwY: number;
  duration: number | null;
  throwerName: string;
}

export interface ReplayBombEvent {
  tick: number;
  type: "PLANTED" | "DEFUSED" | "EXPLODED";
  x: number;
  y: number;
  site: string | null;
}

interface ReplayStore {
  // Data
  frames: TickFrame[];
  kills: KillEvent[];
  grenadeEvents: ReplayGrenadeEvent[];
  bombEvents: ReplayBombEvent[];
  startTick: number;
  endTick: number;

  // Playback state
  currentFrameIndex: number;
  currentRound: number;
  isPlaying: boolean;
  playbackSpeed: number;
  showPlayerNames: boolean;
  showGrenades: boolean;

  // Loading
  isLoading: boolean;

  // Actions
  loadRound: (matchId: string, round: number) => Promise<void>;
  setFrameIndex: (index: number) => void;
  setRound: (round: number) => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  togglePlayerNames: () => void;
  toggleGrenades: () => void;
  nextFrame: () => void;
  reset: () => void;
}

export const useReplayStore = create<ReplayStore>((set, get) => ({
  frames: [],
  kills: [],
  grenadeEvents: [],
  bombEvents: [],
  startTick: 0,
  endTick: 0,
  currentFrameIndex: 0,
  currentRound: 1,
  isPlaying: false,
  playbackSpeed: 1,
  showPlayerNames: true,
  showGrenades: true,
  isLoading: false,

  loadRound: async (matchId, round) => {
    set({ isLoading: true, isPlaying: false, currentFrameIndex: 0 });

    try {
      const [ticksRes, killsRes, grenadesRes, bombsRes] = await Promise.all([
        fetch(`/api/matches/${matchId}/ticks?round=${round}&interval=32`),
        fetch(`/api/matches/${matchId}/kills?round=${round}`),
        fetch(`/api/matches/${matchId}/grenades?round=${round}`),
        fetch(`/api/matches/${matchId}/bombs?round=${round}`),
      ]);

      if (!ticksRes.ok) throw new Error("Failed to load tick data");

      const ticksData = await ticksRes.json();
      const killsData = killsRes.ok ? await killsRes.json() : { kills: [] };
      const grenadesData = grenadesRes.ok ? await grenadesRes.json() : { grenades: [] };
      const bombsData = bombsRes.ok ? await bombsRes.json() : { bombs: [] };

      const grenadeEvents: ReplayGrenadeEvent[] = (grenadesData.grenades ?? []).map(
        (g: { tick: number; type: string; landPos: { x: number; y: number }; throwPos: { x: number; y: number }; duration: number | null; throwerName: string }) => ({
          tick: g.tick,
          type: g.type as ReplayGrenadeEvent["type"],
          landX: g.landPos.x,
          landY: g.landPos.y,
          throwX: g.throwPos.x,
          throwY: g.throwPos.y,
          duration: g.duration,
          throwerName: g.throwerName,
        })
      );

      const bombEvts: ReplayBombEvent[] = (bombsData.bombs ?? []).map(
        (b: { tick: number; type: string; x: number; y: number; site: string | null }) => ({
          tick: b.tick,
          type: b.type as ReplayBombEvent["type"],
          x: b.x,
          y: b.y,
          site: b.site,
        })
      );

      set({
        frames: ticksData.ticks,
        kills: killsData.kills ?? [],
        grenadeEvents,
        bombEvents: bombEvts,
        startTick: ticksData.startTick,
        endTick: ticksData.endTick,
        currentRound: round,
        currentFrameIndex: 0,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, frames: [], grenadeEvents: [], bombEvents: [] });
    }
  },

  setFrameIndex: (index) => {
    const { frames } = get();
    if (index >= 0 && index < frames.length) {
      set({ currentFrameIndex: index });
    }
  },

  setRound: (round) => set({ currentRound: round }),

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  setSpeed: (speed) => set({ playbackSpeed: speed }),

  togglePlayerNames: () => set((s) => ({ showPlayerNames: !s.showPlayerNames })),

  toggleGrenades: () => set((s) => ({ showGrenades: !s.showGrenades })),

  nextFrame: () => {
    const { currentFrameIndex, frames } = get();
    if (currentFrameIndex < frames.length - 1) {
      set({ currentFrameIndex: currentFrameIndex + 1 });
    } else {
      set({ isPlaying: false });
    }
  },

  reset: () =>
    set({
      frames: [],
      kills: [],
      grenadeEvents: [],
      bombEvents: [],
      startTick: 0,
      endTick: 0,
      currentFrameIndex: 0,
      currentRound: 1,
      isPlaying: false,
      playbackSpeed: 1,
      showPlayerNames: true,
      showGrenades: true,
      isLoading: false,
    }),
}));
