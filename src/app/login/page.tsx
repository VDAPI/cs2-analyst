import { CredentialsForm } from "@/components/auth/credentials-form";
import { SteamLoginButton } from "@/components/auth/steam-login";
import { DevLoginButton } from "@/components/auth/dev-login";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign In — CS2 Analyst",
};

export default function LoginPage() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.08) 0%, transparent 60%)" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Sign in
          </h1>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            Welcome back to CS2 Analyst
          </p>
        </div>

        <CredentialsForm mode="login" />

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-xs text-[var(--text-tertiary)]">or</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {/* Steam login */}
        <div className="flex justify-center">
          <SteamLoginButton />
        </div>

        {/* Dev login */}
        <div className="mt-4">
          <DevLoginButton />
        </div>

        {/* Links */}
        <p className="mt-8 text-center text-sm text-[var(--text-tertiary)]">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-[var(--accent)] hover:text-[var(--accent-hover)]">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
