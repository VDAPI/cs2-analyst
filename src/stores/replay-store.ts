import { create } from "zustand";
import { fetchRoundData } from "@/lib/replay/fetch-round";
import type { FindingView } from "@/lib/findings/view";

/**
 * In-flight loads. A newer load (or reset, when the viewer unmounts) aborts the
 * previous one, and a result is applied only if its request is still the
 * latest, so a slow round of match A can never land on match B's viewer.
 */
let roundRequest: AbortController | null = null;
let findingsRequest: AbortController | null = null;

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

/** CS2 server tick rate. */
export const TICK_RATE = 64;

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
  /** Player highlighted on the canvas and in the side list (tap to select). */
  selectedSteamId: string | null;
  /** Field-of-view cones on the canvas. */
  showFov: boolean;
  /** Every finding of the match (mistake markers); loaded once per match. */
  findings: FindingView[];
  /** Finding picked from the timeline or the list, highlighted until another is picked. */
  activeFindingId: string | null;

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
  /** Jump by game seconds (negative = back), clamped to the round. */
  seekSeconds: (seconds: number) => void;
  selectPlayer: (steamId: string | null) => void;
  /** Select a player without toggling (deep links). */
  setSelectedPlayer: (steamId: string | null) => void;
  toggleFov: () => void;
  loadFindings: (matchId: string) => Promise<void>;
  setActiveFinding: (id: string | null) => void;
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
  selectedSteamId: null,
  showFov: true,
  findings: [],
  activeFindingId: null,
  isLoading: false,

  loadRound: async (matchId, round) => {
    roundRequest?.abort();
    const req = new AbortController();
    roundRequest = req;
    set({ isLoading: true, isPlaying: false, currentFrameIndex: 0 });

    try {
      const data = await fetchRoundData(matchId, round, { interval: 32, signal: req.signal });
      if (roundRequest !== req) return;
      roundRequest = null;
      set({
        ...data,
        currentRound: round,
        currentFrameIndex: 0,
        isLoading: false,
      });
    } catch {
      if (roundRequest !== req) return; // superseded or reset: not this load's error
      roundRequest = null;
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

  togglePlay: () =>
    set((s) => {
      if (s.isPlaying || s.frames.length === 0) return { isPlaying: false };
      // Pressing play at the end of the round starts it over.
      const atEnd = s.currentFrameIndex >= s.frames.length - 1;
      return { isPlaying: true, currentFrameIndex: atEnd ? 0 : s.currentFrameIndex };
    }),

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

  seekSeconds: (seconds) => {
    const { frames, currentFrameIndex } = get();
    if (frames.length < 2) return;
    const ticksPerFrame = Math.max(1, frames[1].tick - frames[0].tick);
    const step = Math.round((seconds * TICK_RATE) / ticksPerFrame);
    const index = Math.min(frames.length - 1, Math.max(0, currentFrameIndex + step));
    set({ currentFrameIndex: index });
  },

  selectPlayer: (steamId) =>
    set((s) => ({ selectedSteamId: s.selectedSteamId === steamId ? null : steamId })),

  setSelectedPlayer: (steamId) => set({ selectedSteamId: steamId }),

  toggleFov: () => set((s) => ({ showFov: !s.showFov })),

  loadFindings: async (matchId) => {
    findingsRequest?.abort();
    const req = new AbortController();
    findingsRequest = req;
    try {
      const res = await fetch(`/api/matches/${matchId}/findings`, { signal: req.signal });
      if (!res.ok) return;
      const data = (await res.json()) as { findings?: FindingView[] };
      if (findingsRequest !== req) return;
      set({ findings: data.findings ?? [] });
    } catch {
      if (findingsRequest !== req) return;
      set({ findings: [] });
    } finally {
      if (findingsRequest === req) findingsRequest = null;
    }
  },

  setActiveFinding: (id) => set({ activeFindingId: id }),

  reset: () => {
    roundRequest?.abort();
    roundRequest = null;
    findingsRequest?.abort();
    findingsRequest = null;
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
      selectedSteamId: null,
      showFov: true,
      findings: [],
      activeFindingId: null,
      isLoading: false,
    });
  },
}));
