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

export default async function LoginPage() {
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
