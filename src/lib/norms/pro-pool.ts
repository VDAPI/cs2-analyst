/**
 * The pro pool (S13): pro demos the norms are measured on. They go through
 * the normal parse pipeline, owned by a system user nobody can log in as
 * (no password), so they never show up in a player's matches, limits or
 * stats. Added from /admin/pro or `npm run pro:import -- <folder>`.
 *
 * Where the demos come from is the admin's call. HLTV's terms forbid scraping
 * and business use of its materials, so nothing here downloads from HLTV;
 * use demos you may use (e.g. ones the tournament organiser or Valve publish).
 */
import type { PrismaClient } from "@prisma/client";

export const PRO_POOL_EMAIL = "pro-pool@cs2analyst.local";

/** Addresses on the app's own domain belong to system accounts and cannot be registered. */
export const isReservedEmail = (email: string) => email.trim().toLowerCase().endsWith("@cs2analyst.local");

/**
 * The system user that owns pro uploads (created on first use). Refuses an
 * account with a password: someone could log in as it and see the pool.
 */
export async function getProPoolUserId(prisma: PrismaClient): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: PRO_POOL_EMAIL },
    create: { email: PRO_POOL_EMAIL, name: "Pula pro" },
    update: {},
    select: { id: true, password: true },
  });
  if (user.password) throw new Error(`${PRO_POOL_EMAIL} has a password; it must stay a system account`);
  return user.id;
}

/** "vitality-vs-mouz-m1-inferno.dem" → "vitality vs mouz m1 inferno". */
export function labelFromFileName(name: string): string {
  return name
    .replace(/\.dem$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export const sanitizeLabel = (label: string | null | undefined): string | null => {
  const clean = (label ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return clean || null;
};
