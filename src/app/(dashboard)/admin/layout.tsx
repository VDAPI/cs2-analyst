import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

/** Admins only; everyone else gets a plain 404 so the panel isn't advertised. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await getAdminUser())) notFound();
  return <>{children}</>;
}
