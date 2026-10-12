import { AppShell } from "@/components/layout/app-shell";
import { currentUserIsAdmin } from "@/lib/admin/session";

// /upload lives outside the (dashboard) group but shares its navigation shell.
export default async function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell isAdmin={await currentUserIsAdmin()}>{children}</AppShell>;
}
