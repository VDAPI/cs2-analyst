import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { ArrowLeft, Crosshair } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { planOffers } from "@/lib/billing/plans";
import { TEAM_SEATS } from "@/lib/billing/prices";
import { grantsPlan } from "@/lib/billing/state";
import { stripeConfig } from "@/lib/billing/stripe";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { buttonVariants } from "@/components/ui";
import { PlanCards } from "@/components/billing/plan-cards";
import { BillingNotice } from "@/components/billing/notice";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t("billing.pricingTitle")} — CS2 Analyst`, description: t("billing.pricingDescription") };
}

/** Public pricing (S30): Free / Pro / Team, monthly or yearly. */
export default async function PricingPage() {
  const { t } = await getT();
  const session = await getServerSession(authOptions);
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { plan: true, subscriptions: { select: { status: true } } },
      })
    : null;
  const cfg = stripeConfig();

  const faq = [
    ["billing.faqCancelQ", "billing.faqCancelA"],
    ["billing.faqLimitQ", "billing.faqLimitA"],
    ["billing.faqInvoiceQ", "billing.faqInvoiceA"],
    ["billing.faqTeamQ", "billing.faqTeamA"],
  ] as const;

  return (
    <main className="min-h-dvh px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]">
              <Crosshair className="h-4 w-4 text-[var(--on-accent)]" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="truncate">CS2 Analyst</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher size="sm" />
            {user && (
              <Link href="/billing" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                {t("nav.billing")}
              </Link>
            )}
          </div>
        </div>

        <h1 className="font-display text-[28px] font-bold leading-tight text-[var(--text-primary)] md:text-[40px]">
          {t("billing.pricingTitle")}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-[var(--text-secondary)]">{t("billing.pricingDescription")}</p>

        {(!cfg || !cfg.live) && (
          <div className="mt-4">
            <BillingNotice tone={cfg ? "test" : "info"}>{t(cfg ? "billing.testMode" : "billing.notConfigured")}</BillingNotice>
          </div>
        )}

        <div className="mt-8">
          <PlanCards
            offers={planOffers()}
            currentPlan={user?.plan ?? null}
            payments={Boolean(cfg)}
            subscribed={Boolean(user?.subscriptions.some((s) => grantsPlan(s.status)))}
          />
        </div>

        <section className="mt-12" aria-labelledby="pricing-faq">
          <h2 id="pricing-faq" className="font-display text-xl font-semibold text-[var(--text-primary)]">
            {t("billing.faqTitle")}
          </h2>
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            {faq.map(([q, a]) => (
              <div key={q} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
                <dt className="font-semibold text-[var(--text-primary)]">{t(q)}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{t(a, { seats: TEAM_SEATS - 1 })}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="mt-12 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--border)] pt-6 text-sm text-[var(--text-tertiary)]">
          <Link href="/terms" className="text-[var(--accent)] hover:text-[var(--accent-hover)]">{t("legal.terms")}</Link>
          <Link href="/privacy" className="text-[var(--accent)] hover:text-[var(--accent-hover)]">{t("legal.privacy")}</Link>
        </footer>
      </div>
    </main>
  );
}
