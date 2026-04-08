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

interface ReplayStore {
  // Data
  frames: TickFrame[];
  kills: KillEvent[];
  startTick: number;
  endTick: number;

  // Playback state
  currentFrameIndex: number;
  currentRound: number;
  isPlaying: boolean;
  playbackSpeed: number;
  showPlayerNames: boolean;

  // Loading
  isLoading: boolean;

  // Actions
  loadRound: (matchId: string, round: number) => Promise<void>;
  setFrameIndex: (index: number) => void;
  setRound: (round: number) => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  togglePlayerNames: () => void;
  nextFrame: () => void;
  reset: () => void;
}

export const useReplayStore = create<ReplayStore>((set, get) => ({
  frames: [],
  kills: [],
  startTick: 0,
  endTick: 0,
  currentFrameIndex: 0,
  currentRound: 1,
  isPlaying: false,
  playbackSpeed: 1,
  showPlayerNames: true,
  isLoading: false,

  loadRound: async (matchId, round) => {
    set({ isLoading: true, isPlaying: false, currentFrameIndex: 0 });

    try {
      const res = await fetch(`/api/matches/${matchId}/ticks?round=${round}&interval=32`);
      if (!res.ok) throw new Error("Failed to load tick data");

      const data = await res.json();

      // Also load kills for this round
      const killsRes = await fetch(`/api/matches/${matchId}/kills?round=${round}`);
      const killsData = killsRes.ok ? await killsRes.json() : { kills: [] };

      set({
        frames: data.ticks,
        kills: killsData.kills ?? [],
        startTick: data.startTick,
        endTick: data.endTick,
        currentRound: round,
        currentFrameIndex: 0,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, frames: [] });
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

  nextFrame: () => {
    const { currentFrameIndex, frames } = get();
    if (currentFrameIndex < frames.length - 1) {
      set({ currentFrameIndex: currentFrameIndex + 1 });
    } else {
      set({ isPlaying: false }); // Stop at end
    }
  },

  reset: () =>
    set({
      frames: [],
      kills: [],
      startTick: 0,
      endTick: 0,
      currentFrameIndex: 0,
      currentRound: 1,
      isPlaying: false,
      playbackSpeed: 1,
      showPlayerNames: true,
      isLoading: false,
    }),
}));
