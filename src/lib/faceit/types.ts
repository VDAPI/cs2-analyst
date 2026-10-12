export interface FaceitMatchHistoryResponse {
  items: FaceitMatchSummary[];
  start: number;
  end: number;
  from: number;
  to: number;
}

export interface FaceitMatchSummary {
  match_id: string;
  game_id: string;
  competition_id: string;
  competition_name: string;
  competition_type: string;
  organized: string;
  started_at: number;
  finished_at: number;
  status: string;
  faceit_url: string;
}

export interface FaceitMatchDetail {
  match_id: string;
  game: string;
  competition_id: string;
  competition_name: string;
  competition_type: string;
  status: string;
  started_at: number;
  finished_at: number;
  demo_url: string[];
  faceit_url: string;
  results: {
    winner: string;
    score: {
      faction1: number;
      faction2: number;
    };
  };
  teams: {
    faction1: FaceitTeam;
    faction2: FaceitTeam;
  };
  voting: {
    map: {
      pick: string[];
    };
  };
}

export interface FaceitTeam {
  faction_id: string;
  leader: string;
  name: string;
  roster: FaceitRosterPlayer[];
  stats: {
    winProbability: number;
  };
  avatar: string;
}

export interface FaceitRosterPlayer {
  player_id: string;
  nickname: string;
  avatar: string;
  game_player_id: string;
  game_player_name: string;
}

/** A map offered in the match room's veto (`voting.map.entities`). */
export interface FaceitVotingMapEntity {
  name?: string;
  class_name?: string;
  game_map_id?: string;
  guid?: string;
  image_sm?: string;
  image_lg?: string;
}

/** `teams.factionN.roster[]` in a match room — carries the level the player had in that match. */
export interface FaceitRoomRosterPlayer extends FaceitRosterPlayer {
  game_skill_level?: number;
}

/**
 * The room as GET /matches/{id} returns it before, during and after a match.
 * Looser than `FaceitMatchDetail`: a room in veto has no results or demo yet.
 */
export interface FaceitMatchRoom {
  match_id: string;
  status: string;
  competition_name?: string;
  faceit_url?: string;
  started_at?: number;
  configured_at?: number;
  teams?: Partial<
    Record<
      "faction1" | "faction2",
      { faction_id?: string; name?: string; avatar?: string; roster?: FaceitRoomRosterPlayer[] }
    >
  >;
  voting?: { map?: { entities?: FaceitVotingMapEntity[]; pick?: string[] } };
}

/** GET /players/{id} — only the fields scouting reads. */
export interface FaceitPlayer {
  player_id: string;
  nickname: string;
  avatar?: string;
  country?: string;
  games?: { cs2?: { skill_level?: number; faceit_elo?: number } };
}

/** FACEIT sends every stat as a string ("52", "1.12"). */
export type FaceitStatBag = Record<string, string | string[] | undefined>;

/** GET /players/{id}/stats/cs2 — lifetime totals plus one segment per map. */
export interface FaceitPlayerStats {
  player_id: string;
  lifetime?: FaceitStatBag;
  segments?: { label: string; type: string; mode?: string; stats: FaceitStatBag }[];
}

/** GET /players/{id}/games/cs2/stats — one item per recent match. */
export interface FaceitPlayerGames {
  items?: { stats: FaceitStatBag }[];
}
