/**
 * Reference pro values (S13), used by `proNorm` until the pro pool has at
 * least MIN_NORM_N measured player-matches for a metric. They are the
 * middle half (p25–p75) and median of a pro player's MATCH value, in the
 * metric's own unit and definition (src/lib/findings/report.ts), estimated
 * from public sources (Leetify's published glossary and pro aim
 * percentiles, CS2 movement physics, binomial spread of per-match counts),
 * each checked by a second, independent review against our code — never
 * from HLTV, whose terms forbid scraping and business use. Most are
 * estimates; the report marks them with ≈.
 *
 * Replace them by importing pro demos (/admin/pro or `npm run pro:import`),
 * not by editing this file.
 */
export interface ReferenceNorm {
  p25: number;
  p50: number;
  p75: number;
}

export const REFERENCE_NORMS: Record<string, ReferenceNorm> = {
  // Strzelanie. moving_first/first_bullet: engagement bursts only, all guns.
  // hs is head hits / all hits (not kill HS%): pros ~24%.
  moving_first: { p25: 8, p50: 12, p75: 17 },
  strafe: { p25: 45, p50: 55, p75: 68 },
  first_bullet: { p25: 42, p50: 48, p75: 55 },
  hs: { p25: 20, p50: 24, p75: 28 },
  spray: { p25: 25, p50: 30, p75: 35 },
  // Celowanie. Reaction is read from 4-tick frames after game spotting, which
  // lags real visibility, so it reads below human reaction time.
  crosshair: { p25: 5, p50: 7, p75: 10 },
  reaction: { p25: 90, p50: 160, p75: 250 },
  ttd: { p25: 400, p50: 550, p75: 750 },
  preaim: { p25: 33, p50: 42, p75: 52 },
  overflick: { p25: 15, p50: 25, p75: 35 },
  // Pojedynki, dźwięk (noise/jump/reload are counts per match; jump-throws count).
  dry_peek: { p25: 30, p50: 42, p75: 55 },
  opening: { p25: 36, p50: 50, p75: 64 },
  noise: { p25: 4, p50: 7, p75: 12 },
  jump: { p25: 1, p50: 3, p75: 5 },
  reload: { p25: 1, p50: 3, p75: 5 },
  // Gra zespołowa, ekonomia, pozycje (3 s trade window, nearest teammate only).
  traded_deaths: { p25: 14, p50: 20, p75: 27 },
  trades: { p25: 27, p50: 38, p75: 50 },
  same_spot: { p25: 45, p50: 60, p75: 75 },
  bad_force: { p25: 0, p50: 0, p75: 1 },
  // Utility (per grenade / per death; CS2 flashes blind shorter than CS:GO ones).
  flash_blind: { p25: 1.1, p50: 1.5, p75: 2 },
  team_flash: { p25: 0.15, p50: 0.3, p75: 0.5 },
  flash_follow: { p25: 60, p50: 70, p75: 80 },
  smoke_wasted: { p25: 0, p50: 10, p75: 20 },
  he_damage: { p25: 8, p50: 13, p75: 19 },
  molotov_damage: { p25: 4, p50: 7, p75: 11 },
  unused_utility: { p25: 140, p50: 210, p75: 280 },
};
