import { CredentialsForm } from "@/components/auth/credentials-form";
import { SteamLoginButton } from "@/components/auth/steam-login";
import { DevLoginButton } from "@/components/auth/dev-login";
import { AuthShell, AuthDivider } from "@/components/auth/auth-shell";
import { getT } from "@/lib/i18n/server";
import { isSteamLoginEnabled } from "@/lib/auth";
import type { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.loginMetaTitle") };
}

interface Props {
  // NextAuth sends failed Steam sign-ins back here with ?error=<code>.
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const { t } = await getT();
  return (
    <AuthShell
      title={t("auth.loginTitle")}
      subtitle={t("auth.loginSubtitle")}
      footer={
        <>
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">
            {t("auth.createAccount")}
          </Link>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded-lg border-l-[3px] border-[var(--mistake)] bg-[var(--mistake-muted)] px-3 py-2 text-sm text-[var(--mistake)]">
          {t("auth.steamLoginFailed")}
        </p>
      )}
      <CredentialsForm mode="login" />

      {isSteamLoginEnabled() && (
        <>
          <AuthDivider label={t("auth.or")} />
          <div className="flex justify-center">
            <SteamLoginButton />
          </div>
        </>
      )}

      <div className="mt-4">
        <DevLoginButton />
      </div>
    </AuthShell>
  );
}
