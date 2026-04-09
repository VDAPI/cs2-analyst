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
