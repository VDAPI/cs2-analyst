import { SteamLoginButton } from "@/components/auth/steam-login";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign In — CS2 Analyst",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          Sign in
        </h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Connect your Steam account to analyze your CS2 demos
        </p>

        <div className="mt-8 flex justify-center">
          <SteamLoginButton />
        </div>

        <p className="mt-8 text-xs text-[var(--text-tertiary)]">
          We only access your public Steam profile.{" "}
          <Link href="/" className="underline hover:text-[var(--text-secondary)]">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
