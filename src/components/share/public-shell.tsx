import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { buttonVariants } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

/**
 * Chrome of the public pages (shared report or moment, public profile): logo,
 * the content, and a call to analyse your own demos. No app navigation.
 */
export async function PublicShell({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface-1)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo href="/" />
          <Link href="/register" className={buttonVariants({ variant: "primary", size: "sm" })}>
            {t("shared.ctaButton")}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:py-8">
        {children}
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--border-active)] bg-[var(--accent-muted)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-lg font-semibold text-[var(--text-primary)]">{t("shared.ctaTitle")}</p>
            <p className="text-sm text-[var(--text-secondary)]">{t("shared.ctaBody")}</p>
          </div>
          <Link href="/register" className={buttonVariants({ variant: "cta" })}>
            {t("shared.ctaButton")}
          </Link>
        </section>
      </main>
    </div>
  );
}
