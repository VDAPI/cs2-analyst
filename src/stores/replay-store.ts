import { create } from "zustand";
import type { ReplayState } from "@/types";

interface ReplayStore extends ReplayState {
  // Actions
  setTick: (tick: number) => void;
  setRound: (round: number) => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  selectPlayer: (steamId: string | null) => void;
  toggleSmokes: () => void;
  toggleFlashes: () => void;
  toggleMolotovs: () => void;
  toggleTrajectories: () => void;
  togglePlayerNames: () => void;
  toggleEquipment: () => void;
  reset: () => void;
}

const initialState: ReplayState = {
  currentTick: 0,
  currentRound: 1,
  isPlaying: false,
  playbackSpeed: 1,
  selectedPlayer: null,
  showSmokes: true,
  showFlashes: true,
  showMolotovs: true,
  showTrajectories: true,
  showPlayerNames: true,
  showEquipment: false,
};

export const useReplayStore = create<ReplayStore>((set) => ({
  ...initialState,

  setTick: (tick) => set({ currentTick: tick }),
  setRound: (round) => set({ currentRound: round, currentTick: 0 }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setSpeed: (speed) => set({ playbackSpeed: speed }),
  selectPlayer: (steamId) => set({ selectedPlayer: steamId }),
  toggleSmokes: () => set((s) => ({ showSmokes: !s.showSmokes })),
  toggleFlashes: () => set((s) => ({ showFlashes: !s.showFlashes })),
  toggleMolotovs: () => set((s) => ({ showMolotovs: !s.showMolotovs })),
  toggleTrajectories: () =>
    set((s) => ({ showTrajectories: !s.showTrajectories })),
  togglePlayerNames: () =>
    set((s) => ({ showPlayerNames: !s.showPlayerNames })),
  toggleEquipment: () => set((s) => ({ showEquipment: !s.showEquipment })),
  reset: () => set(initialState),
}));
