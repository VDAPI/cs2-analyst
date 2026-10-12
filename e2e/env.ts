/**
 * Environment of the E2E stack (S19): its own database and Redis DB, the
 * fixture demo parser, a production build on port 3100.
 * Override DATABASE_URL / REDIS_URL / E2E_PORT to point it elsewhere.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const BASE_URL = `http://localhost:${E2E_PORT}`;

export const E2E_USER = {
  email: "e2e@cs2analyst.local",
  password: "e2e-haslo-123",
  name: "E2E Gracz",
};

export const e2eEnv: Record<string, string> = {
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ?? "postgresql://cs2analyst:cs2analyst@localhost:5432/cs2analyst_e2e",
  REDIS_URL: process.env.E2E_REDIS_URL ?? "redis://localhost:6379/5",
  NEXTAUTH_URL: BASE_URL,
  NEXTAUTH_SECRET: "e2e-only-secret-not-for-production",
  E2E_FIXTURE_DEMOS: "1",
  DEMO_RETENTION: "delete",
  // Nothing in the suite may reach FACEIT, Steam or Sentry.
  FACEIT_API_KEY: "",
  FACEIT_DOWNLOADS_API_KEY: "",
  STEAM_API_KEY: "",
  SENTRY_DSN: "",
};

/** Written by global-setup, read by the specs: ids of the seeded data. */
export const SEED_STATE_FILE = "e2e/.state/seed.json";
export const AUTH_STATE_FILE = "e2e/.state/user.json";

export interface SeedState {
  userId: string;
  /** Analyzed matches of the E2E account, newest first. */
  matchIds: string[];
  uploadIds: string[];
  proMatchId: string;
  /** SteamIDs: the account's own player and an opponent. */
  playerSteamId: string;
  opponentSteamId: string;
  teammateSteamId: string;
  /** The account's team (S17), its scouted rival and a saved tactic board. */
  teamId: string;
  rivalId: string;
  boardId: string;
}
