// ─── Demo Parser Types ───────────────────────────────────

export interface ParsedDemo {
  header: DemoHeader;
  rounds: ParsedRound[];
  players: ParsedPlayer[];
  kills: ParsedKill[];
  grenades: ParsedGrenade[];
  bombEvents: ParsedBombEvent[];
  ticks: PlayerTickData[];
}

export interface DemoHeader {
  map: string;
  duration: number;
  tickRate: number;
  totalTicks: number;
  date: Date;
  server: string;
  scoreCT: number;
  scoreT: number;
}

export interface ParsedRound {
  number: number;
  winner: "CT" | "T";
  winReason: string;
  startTick: number;
  endTick: number;
  ctScore: number;
  tScore: number;
  ctEquipValue: number;
  tEquipValue: number;
}

export interface ParsedPlayer {
  steamId: string;
  name: string;
  team: "CT" | "T";
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  hltvRating: number;
  hsPercent: number;
  utilityDamage: number;
  flashAssists: number;
  firstKills: number;
  firstDeaths: number;
}

export interface ParsedKill {
  tick: number;
  roundNumber: number;
  attackerSteamId: string;
  attackerName: string;
  victimSteamId: string;
  victimName: string;
  assisterSteamId?: string;
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  throughSmoke: boolean;
  noScope: boolean;
  flashAssisted: boolean;
  attackerPos: Position3D;
  victimPos: Position3D;
  isFirstKill: boolean;
}

export interface ParsedGrenade {
  tick: number;
  roundNumber: number;
  throwerSteamId: string;
  throwerName: string;
  type: GrenadeType;
  throwPos: Position3D;
  landPos: Position3D;
  trajectory: TrajectoryPoint[];
  duration?: number;
  damageDealt: number;
  playersFlashed: number;
}

export interface ParsedBombEvent {
  tick: number;
  roundNumber: number;
  type: string;
  playerSteamId: string;
  pos: Position3D;
  site?: "A" | "B";
}

export interface PlayerTickData {
  tick: number;
  steamId: string;
  name: string;
  team: "CT" | "T";
  pos: Position3D;
  viewAngle: number;
  health: number;
  armor: number;
  weapon: string;
  isAlive: boolean;
  money: number;
  equipmentValue: number;
  hasDefuser: boolean;
  hasBomb: boolean;
  isFlashed: number; // flash duration remaining
}

// ─── Geometry ────────────────────────────────────────────

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Position2D {
  x: number;
  y: number;
}

export interface TrajectoryPoint {
  tick: number;
  x: number;
  y: number;
  z: number;
}

// ─── Map Config ──────────────────────────────────────────

export interface MapConfig {
  name: string;
  displayName: string;
  radarImage: string;
  // Coordinate transformation: game coords → pixel coords
  posX: number; // top-left X in game units
  posY: number; // top-left Y in game units
  scale: number; // pixels per game unit
  width: number; // radar image width in px
  height: number; // radar image height in px
}

export type GrenadeType =
  | "SMOKE"
  | "FLASH"
  | "HE"
  | "MOLOTOV"
  | "INCENDIARY"
  | "DECOY";

// ─── Replay State ────────────────────────────────────────

export interface ReplayState {
  currentTick: number;
  currentRound: number;
  isPlaying: boolean;
  playbackSpeed: number; // 0.25, 0.5, 1, 2, 4
  selectedPlayer: string | null; // steamId
  showSmokes: boolean;
  showFlashes: boolean;
  showMolotovs: boolean;
  showTrajectories: boolean;
  showPlayerNames: boolean;
  showEquipment: boolean;
}

// ─── Stats & Analytics ───────────────────────────────────

export interface PlayerStats {
  steamId: string;
  name: string;
  avatar: string;
  matchesPlayed: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgADR: number;
  avgHLTV: number;
  avgHSPercent: number;
  recentForm: number[]; // last 10 match HLTV ratings
  bestMap: string;
  worstMap: string;
}

export interface HeatmapData {
  points: HeatmapPoint[];
  map: string;
  filter: HeatmapFilter;
}

export interface HeatmapPoint {
  x: number;
  y: number;
  intensity: number;
}

export interface HeatmapFilter {
  type: "kills" | "deaths" | "positions" | "grenades";
  side?: "CT" | "T";
  rounds?: number[];
  players?: string[];
}

export interface EconomyRound {
  roundNumber: number;
  ctMoney: number;
  tMoney: number;
  ctEquipValue: number;
  tEquipValue: number;
  ctBuyType: string;
  tBuyType: string;
  winner: "CT" | "T";
}
