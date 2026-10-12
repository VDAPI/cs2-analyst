import { CredentialsForm } from "@/components/auth/credentials-form";
import { SteamLoginButton } from "@/components/auth/steam-login";
import { DevLoginButton } from "@/components/auth/dev-login";
import { AuthShell, AuthDivider } from "@/components/auth/auth-shell";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Logowanie — CS2 Analyst",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Zaloguj się"
      subtitle="Wracaj do analizy swoich meczów"
      footer={
        <>
          Nie masz konta?{" "}
          <Link href="/register" className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">
            Załóż konto
          </Link>
        </>
      }
    >
      <CredentialsForm mode="login" />

      <AuthDivider />

      <div className="flex justify-center">
        <SteamLoginButton />
      </div>

      <div className="mt-4">
        <DevLoginButton />
      </div>
    </AuthShell>
  );
}
