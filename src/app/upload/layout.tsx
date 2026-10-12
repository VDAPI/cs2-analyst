import { AppShell } from "@/components/layout/app-shell";

// /upload lives outside the (dashboard) group but shares its navigation shell.
export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
