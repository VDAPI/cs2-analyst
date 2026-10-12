import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import type { Plan } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { formatLimit, getPlanUsage } from "@/lib/limits";
import { planOffers } from "@/lib/billing/plans";
import { formatMoney } from "@/lib/billing/prices";
import { grantsPlan, primarySubscription, teamSeatPlan } from "@/lib/billing/state";
import { syncCheckoutSession } from "@/lib/billing/persist";
import { stripeConfig } from "@/lib/billing/stripe";
import { formatDate } from "@/lib/utils/formatters";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { PlanCards } from "@/components/billing/plan-cards";
import { BillingActions } from "@/components/billing/billing-actions";
import { BillingNotice } from "@/components/billing/notice";

const PLAN_NAME: Record<Plan, MessageKey> = { FREE: "billing.planFree", PRO: "billing.planPro", TEAM: "billing.planTeam" };

const STATUS: Record<string, MessageKey> = {
  active: "billing.statusActive",
  trialing: "billing.statusTrialing",
  past_due: "billing.statusPastDue",
  canceled: "billing.statusCanceled",
  unpaid: "billing.statusUnpaid",
  incomplete: "billing.statusIncomplete",
  incomplete_expired: "billing.statusIncomplete",
};

const INVOICE_STATUS: Record<string, MessageKey> = {
  paid: "billing.invoicePaid",
  open: "billing.invoiceOpen",
  void: "billing.invoiceVoid",
  uncollectible: "billing.invoiceVoid",
  draft: "billing.invoiceDraft",
};

interface Props {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}

/** Plan & billing (S30): current plan, Stripe subscription, usage, plans and invoices. */
export default async function BillingPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?callbackUrl=/billing");
  const userId = session.user.id;
  const { t } = await getT();
  const params = await searchParams;
  const cfg = stripeConfig();

  // Back from Stripe Checkout: store the subscription now, so the plan is
  // raised even where Stripe's webhooks can't reach the app (a local setup).
  let synced = false;
  if (params.checkout === "success" && params.session_id && cfg) {
    synced = await syncCheckoutSession(cfg, params.session_id, userId).catch((err) => {
      console.error("[billing] checkout sync failed", err);
      return false;
    });
  }

  const [user, usage, seatTeams] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        stripeCustomerId: true,
        subscriptions: true,
        invoices: { orderBy: { created: "desc" }, take: 24 },
      },
    }),
    getPlanUsage(userId),
    prisma.team.findMany({
      where: { members: { some: { userId } }, AND: { members: { some: { role: "OWNER", user: { plan: "TEAM" } } } } },
      select: { name: true, members: { select: { userId: true, joinedAt: true, role: true, user: { select: { plan: true } } } } },
      take: 10,
    }),
  ]);
  if (!user) redirect("/login");

  const sub = primarySubscription(user.subscriptions);
  const subscribed = user.subscriptions.some((s) => grantsPlan(s.status));
  const seatTeam = seatTeams.find((team) => {
    const owner = team.members.find((m) => m.role === "OWNER");
    return owner && teamSeatPlan(userId, [{ ownerId: owner.userId, ownerPlan: owner.user.plan, members: team.members }]);
  });

  const notice =
    params.checkout === "success"
      ? synced || user.plan !== "FREE"
        ? { tone: "success" as const, text: t("billing.checkoutSuccess", { plan: t(PLAN_NAME[user.plan]) }) }
        : { tone: "info" as const, text: t("billing.checkoutPending") }
      : params.checkout === "cancel"
        ? { tone: "info" as const, text: t("billing.checkoutCancel") }
        : null;

  const usageRows = [
    { label: t("settings.usageMonth"), value: `${usage.used}/${formatLimit(usage.limit)}` },
    { label: t("settings.usageKept"), value: `${usage.keptDemos}/${formatLimit(usage.limits.keptDemos)}` },
    { label: t("settings.usageBatch"), value: String(usage.limits.batchSize) },
    { label: t("settings.usageFiles"), value: String(usage.limits.uploadFiles) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("billing.eyebrow")}
        title={t("billing.title")}
        description={t("billing.description")}
        back={{ href: "/settings", label: t("nav.settings") }}
      />

      {notice && <BillingNotice tone={notice.tone}>{notice.text}</BillingNotice>}
      {cfg ? (
        !cfg.live && <BillingNotice tone="test">{t("billing.testMode")}</BillingNotice>
      ) : (
        <BillingNotice tone="info">{t("billing.notConfigured")}</BillingNotice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="billing-current">
          <CardHeader
            title={t("billing.currentTitle")}
            action={<Badge variant={user.plan === "FREE" ? "neutral" : "lime"}>{t(PLAN_NAME[user.plan])}</Badge>}
          />
          <div className="space-y-2 text-sm text-[var(--text-secondary)]">
            {sub ? (
              <>
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant={grantsPlan(sub.status) ? (sub.status === "past_due" ? "warning" : "success") : "neutral"}>
                    {STATUS[sub.status] ? t(STATUS[sub.status]) : t("billing.statusOther", { status: sub.status })}
                  </Badge>
                  <span>
                    {t(PLAN_NAME[sub.plan])} · {t(sub.interval === "year" ? "billing.billedYearly" : "billing.billedMonthly")}
                  </span>
                </p>
                {sub.currentPeriodEnd && grantsPlan(sub.status) && (
                  <p className="font-mono text-xs text-[var(--text-tertiary)]">
                    {t(sub.cancelAtPeriodEnd ? "billing.endsOn" : "billing.renews", { date: formatDate(sub.currentPeriodEnd) })}
                  </p>
                )}
                {sub.status === "past_due" && <p className="text-[var(--warning)]">{t("billing.pastDueHint")}</p>}
              </>
            ) : (
              <p>{user.plan === "FREE" ? t("billing.noSubscription") : t("billing.adminPlan")}</p>
            )}
            {seatTeam && <p className="text-[var(--accent-2)]">{t("billing.seatFrom", { team: seatTeam.name })}</p>}
            {cfg && user.stripeCustomerId && <p className="text-xs text-[var(--text-tertiary)]">{t("billing.manageHint")}</p>}
          </div>
          {cfg && (
            <div className="mt-4">
              <BillingActions portal={Boolean(user.stripeCustomerId)} />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t("billing.usageTitle")}
            action={<Badge variant={usage.plan === "FREE" ? "neutral" : "lime"}>{t(PLAN_NAME[usage.plan])}</Badge>}
          />
          <dl className="grid grid-cols-2 gap-3">
            {usageRows.map((row) => (
              <div key={row.label} className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <dt className="label-overline text-[var(--text-tertiary)]" title={row.label}>
                  {row.label}
                </dt>
                <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-[var(--text-primary)]">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <section className="space-y-3" aria-labelledby="plans-title">
        <h2 id="plans-title" className="font-display text-lg font-semibold text-[var(--text-primary)]">
          {t("billing.plansTitle")}
        </h2>
        <PlanCards offers={planOffers()} currentPlan={user.plan} payments={Boolean(cfg)} subscribed={subscribed} />
        <p className="text-sm">
          <Link href="/pricing" className="text-[var(--accent)] hover:text-[var(--accent-hover)]">
            {t("billing.openPricing")}
          </Link>
        </p>
      </section>

      <Card>
        <CardHeader title={t("billing.invoicesTitle")} />
        {user.invoices.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">{t("billing.invoicesEmpty")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("billing.invoiceNumber")}</th>
                  <th>{t("billing.invoiceDate")}</th>
                  <th>{t("billing.invoiceAmount")}</th>
                  <th>{t("billing.invoiceStatus")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {user.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-mono">{inv.number ?? "—"}</td>
                    <td className="font-mono">{formatDate(inv.created)}</td>
                    <td className="font-mono tabular-nums">
                      {formatMoney(inv.status === "paid" ? inv.amountPaid : inv.amountDue, inv.currency)}
                    </td>
                    <td>
                      <Badge variant={inv.status === "paid" ? "success" : inv.status === "open" ? "warning" : "neutral"}>
                        {INVOICE_STATUS[inv.status] ? t(INVOICE_STATUS[inv.status]) : inv.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {inv.hostedUrl && (
                        <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:text-[var(--accent-hover)]">
                          {t("billing.invoiceView")}
                        </a>
                      )}
                      {inv.pdfUrl && (
                        <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="ml-3 text-[var(--accent)] hover:text-[var(--accent-hover)]">
                          {t("billing.invoicePdf")}
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
