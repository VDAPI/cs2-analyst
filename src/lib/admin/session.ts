/**
 * Server-side admin checks. Always read the role from the DB, never from the
 * session JWT, so revoking admin takes effect on the next request.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { isAdminUser } from "./access";

export interface AdminUser {
  id: string;
  email: string | null;
}

/** The signed-in admin, or null for guests and regular players. */
export async function getAdminUser(): Promise<AdminUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true },
  });
  return user && isAdminUser(user) ? { id: user.id, email: user.email } : null;
}

/** For layouts: whether to show the admin link in the navigation. */
export async function currentUserIsAdmin(): Promise<boolean> {
  return (await getAdminUser().catch(() => null)) !== null;
}

/**
 * For admin pages: the admin, or a 404. Every admin page.tsx calls it itself;
 * the admin layout's check alone is not enough, because a client router
 * request (RSC header + router state tree) can render a page without
 * re-running the layouts it says it already has.
 */
export async function requireAdminPage(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) notFound();
  return admin;
}
