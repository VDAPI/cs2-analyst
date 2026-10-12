/** Team invite codes (S17), server only (node:crypto). Format check: `isInviteCode` in roster.ts. */
import { randomBytes } from "node:crypto";

/** Join token: 12 URL-safe characters (72 bits). */
export function newInviteCode(): string {
  return randomBytes(9).toString("base64url");
}
