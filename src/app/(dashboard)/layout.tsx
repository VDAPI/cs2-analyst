import { AppShell } from "@/components/layout/app-shell";
import { currentUserIsAdmin } from "@/lib/admin/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell isAdmin={await currentUserIsAdmin()}>{children}</AppShell>;
}
