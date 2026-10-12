/**
 * Who may open the admin panel. Pure, so `npm run test:admin` covers it.
 *
 * A user is an admin when their row has `role: ADMIN`. In development the
 * dev login is an admin too, so the panel can be tried locally without any
 * setup.
 *
 * `ADMIN_EMAILS` does NOT grant admin at runtime: emails are not verified, so
 * anyone could register an address on that list (before its owner does) and
 * get the panel. The first admin is promoted from the server's shell with
 * `npm run admin:grant -- <email>` (or with no argument, every address in
 * `ADMIN_EMAILS`), which sets `role: ADMIN` on the existing account; after
 * that, admins change roles in /admin/users.
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
  env: { NODE_ENV?: string } = process.env
): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  // The dev login only exists in development; @cs2analyst.local can't be registered.
  return env.NODE_ENV === "development" && user.email === DEV_ADMIN_EMAIL;
}
