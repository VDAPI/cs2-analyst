import type { MessageKey } from "@/lib/i18n/translate";

export const ROLE_KEY: Record<string, MessageKey> = {
  OWNER: "team.roleOwner",
  COACH: "team.roleCoach",
  PLAYER: "team.rolePlayer",
};

/** "62%" or "—" without samples. */
export function pctText(won: number, played: number): string {
  return played > 0 ? `${Math.round((won / played) * 100)}%` : "—";
}
