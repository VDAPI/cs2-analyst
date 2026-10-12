/**
 * Who may open the admin panel. Pure, so `npm run test:admin` covers it.
 *
 * A user is an admin when their row has `role: ADMIN`, or their email is in
 * the comma-separated `ADMIN_EMAILS` env var (how the first admin gets in on
 * a fresh database). In development the dev login is an admin too, so the
 * panel can be tried locally without any setup.
 */
import type { UserRole } from "@prisma/client";

export const DEV_ADMIN_EMAIL = "dev@cs2analyst.local";

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(
  user: { role: UserRole; email: string | null } | null | undefined,
  env: { ADMIN_EMAILS?: string; NODE_ENV?: string } = process.env
): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const email = user.email?.toLowerCase();
  if (!email) return false;
  if (env.NODE_ENV === "development" && email === DEV_ADMIN_EMAIL) return true;
  return parseAdminEmails(env.ADMIN_EMAILS).includes(email);
}
