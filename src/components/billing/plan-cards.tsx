"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import type { Plan } from "@prisma/client";
import { Badge, Button, buttonVariants, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { formatMoney, type BillingInterval } from "@/lib/billing/prices";
import type { PlanOffer } from "@/lib/billing/plans";
import { cn } from "@/lib/utils/cn";

const NAME: Record<Plan, MessageKey> = { FREE: "billing.planFree", PRO: "billing.planPro", TEAM: "billing.planTeam" };
const TAGLINE: Record<Plan, MessageKey> = {
  FREE: "billing.taglineFree",
  PRO: "billing.taglinePro",
  TEAM: "billing.taglineTeam",
};

interface Props {
  offers: PlanOffer[];
  /** null = signed out (/pricing). */
  currentPlan: Plan | null;
  /** Stripe is configured on this server. */
  payments: boolean;
  /** The account already has a paying subscription (changes go through the portal). */
  subscribed: boolean;
}

/** Free / Pro / Team cards with a monthly-yearly switch; buying starts a Stripe Checkout. */
export function PlanCards({ offers, currentPlan, payments, subscribed }: Props) {
  const t = useT();
  const toast = useToast();
  const [interval, setBillingInterval] = useState<BillingInterval>("month");
  const [busy, setBusy] = useState<Plan | null>(null);
  const bestSave = Math.max(...offers.map((o) => o.yearlySave));

  async function openPortal() {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { url?: string };
    if (data.url) window.location.assign(data.url);
    else toast({ title: t("billing.error"), variant: "error" });
  }

  async function buy(plan: Plan) {
    setBusy(plan);
    try {
      if (subscribed) {
        await openPortal();
        return;
      }
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; code?: string };
      if (data.url) {
        toast({ title: t("billing.redirecting"), variant: "info" });
        window.location.assign(data.url);
        return;
      }
      if (data.code === "has_subscription") {
        toast({ title: t("billing.alreadySubscribed"), variant: "info" });
        await openPortal();
        return;
      }
      toast({ title: t(data.code === "not_configured" ? "billing.notConfigured" : "billing.error"), variant: "error" });
    } catch {
      toast({ title: t("billing.error"), variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="radiogroup"
        aria-label={t("billing.plansTitle")}
        className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-1"
      >
        {(["month", "year"] as const).map((iv) => (
          <button
            key={iv}
            type="button"
            role="radio"
            aria-checked={interval === iv}
            onClick={() => setBillingInterval(iv)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors max-md:min-h-11",
              interval === iv
                ? "bg-[var(--accent)] text-[var(--on-accent)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {t(iv === "month" ? "billing.monthly" : "billing.yearly")}
            {iv === "year" && bestSave > 0 && (
              <span className={cn("font-mono text-xs", interval === iv ? "" : "text-[var(--accent-2)]")}>
                {t("billing.yearlySave", { percent: bestSave })}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {offers.map((o) => {
          const isCurrent = currentPlan === o.plan;
          const amount = o.price[interval];
          return (
            <section
              key={o.plan}
              data-plan={o.plan}
              className={cn(
                "flex min-w-0 flex-col rounded-xl border bg-[var(--surface-1)] p-5",
                o.highlight
                  ? "border-[var(--accent)] shadow-[0_0_32px_var(--accent-glow)]"
                  : "border-[var(--border)]"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">{t(NAME[o.plan])}</h3>
                {isCurrent && <Badge variant="lime">{t("billing.current")}</Badge>}
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {t(TAGLINE[o.plan], { seats: o.seats + 1 })}
              </p>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="font-mono text-4xl font-bold tabular-nums text-[var(--text-primary)]">
                  {formatMoney(amount)}
                </span>
                {o.plan !== "FREE" && (
                  <span className="text-sm text-[var(--text-tertiary)]">
                    {t(interval === "month" ? "billing.perMonth" : "billing.perYear")}
                  </span>
                )}
              </p>
              <p className="mt-1 min-h-5 font-mono text-xs text-[var(--text-tertiary)]">
                {o.plan !== "FREE" && interval === "year"
                  ? t("billing.yearlyEquivalent", { amount: formatMoney(Math.round(o.price.year / 12)) })
                  : ""}
              </p>

              <ul className="mt-4 flex-1 space-y-2 text-sm text-[var(--text-secondary)]">
                {[
                  o.monthlyDemos == null
                    ? t("billing.featureMonthlyUnlimited")
                    : t("billing.featureMonthly", { n: o.monthlyDemos }),
                  t("billing.featureKept", { n: o.keptDemos }),
                  t("billing.featureBatch", { n: o.batchSize }),
                  t("billing.featureFiles", { n: o.uploadFiles }),
                  t("billing.featureReport"),
                  ...(o.seats > 0 ? [t("billing.featureSeats", { n: o.seats }), t("billing.featureTeamTools")] : []),
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden />
                    <span className="min-w-0">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {o.plan === "FREE" ? (
                  currentPlan == null ? (
                    <Link href="/register" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
                      {t("billing.startFree")}
                    </Link>
                  ) : null
                ) : currentPlan == null ? (
                  <Link
                    href={`/login?callbackUrl=${encodeURIComponent("/billing")}`}
                    className={cn(buttonVariants({ variant: o.highlight ? "cta" : "primary" }), "w-full")}
                  >
                    {t("billing.signInToBuy")}
                  </Link>
                ) : (
                  <Button
                    type="button"
                    variant={o.highlight ? "cta" : "primary"}
                    className="w-full"
                    disabled={!payments || isCurrent || busy != null}
                    onClick={() => void buy(o.plan)}
                  >
                    {busy === o.plan && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {isCurrent ? t("billing.current") : t("billing.choose", { plan: t(NAME[o.plan]) })}
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
