import { CredentialsForm } from "@/components/auth/credentials-form";
import { SteamLoginButton } from "@/components/auth/steam-login";
import { AuthShell, AuthDivider } from "@/components/auth/auth-shell";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Rejestracja — CS2 Analyst",
};

export default function RegisterPage() {
  return (
    <AuthShell
      title="Załóż konto"
      subtitle="Wgraj demo i zobacz, co poprawić w swojej grze"
      footer={
        <>
          Masz już konto?{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">
            Zaloguj się
          </Link>
        </>
      }
    >
      <CredentialsForm mode="register" />

      <AuthDivider />

      <div className="flex justify-center">
        <SteamLoginButton />
      </div>
    </AuthShell>
  );
}
