import { CredentialsForm } from "@/components/auth/credentials-form";
import { SteamLoginButton } from "@/components/auth/steam-login";
import { AuthShell, AuthDivider } from "@/components/auth/auth-shell";
import { getT } from "@/lib/i18n/server";
import { isSteamLoginEnabled } from "@/lib/auth";
import type { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.registerMetaTitle") };
}

export default async function RegisterPage() {
  const { t } = await getT();
  return (
    <AuthShell
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">
            {t("auth.signIn")}
          </Link>
        </>
      }
    >
      <CredentialsForm mode="register" />

      {isSteamLoginEnabled() && (
        <>
          <AuthDivider label={t("auth.or")} />
          <div className="flex justify-center">
            <SteamLoginButton />
          </div>
        </>
      )}
    </AuthShell>
  );
}
