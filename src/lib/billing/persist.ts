/**
 * Payments (S30), DB side: stores Stripe subscriptions and invoices and keeps
 * User.plan in step with them. Called by the webhook, by the /billing page
 * after a checkout (so a local setup without webhook forwarding still gets
 * its plan) and by "Odśwież status".
 */
import type { Plan, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  idOf,
  invoiceFromStripe,
  nextUserPlan,
  subscriptionFromStripe,
  type InvoiceState,
  type SubscriptionState,
} from "./state";
import {
  cancelSubscriptionNow,
  listInvoices,
  listSubscriptions,
  priceToPlanFromEnv,
  retrieveCheckoutSession,
  retrieveSubscription,
  stripeConfig,
  type StripeConfig,
  type StripeObject,
} from "./stripe";

/** The account a Stripe customer belongs to: the stored link, else the metadata's user (linked now). */
async function userForCustomer(customerId: string, metaUserId: string | null): Promise<string | null> {
  const linked = await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  if (linked) return linked.id;
  if (!metaUserId) return null;
  const user = await prisma.user.findUnique({ where: { id: metaUserId }, select: { id: true, stripeCustomerId: true } });
  // Never move an account to another customer: the first link wins.
  if (!user || (user.stripeCustomerId && user.stripeCustomerId !== customerId)) return null;
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  return user.id;
}

/** Recomputes User.plan from the account's subscription rows. Returns the new plan. */
export async function refreshUserPlan(userId: string): Promise<Plan | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  if (!user) return null;
  const subs = await prisma.billingSubscription.findMany({ where: { userId }, select: { plan: true, status: true } });
  const plan = nextUserPlan(user.plan, subs);
  if (plan !== user.plan) {
    await prisma.user.update({ where: { id: userId }, data: { plan } });
    console.log(`[billing] user=${userId} plan ${user.plan} → ${plan}`);
  }
  return plan;
}

export async function saveSubscription(sub: SubscriptionState): Promise<string | null> {
  const userId = await userForCustomer(sub.customerId, sub.userId);
  if (!userId) {
    console.warn(`[billing] subscription ${sub.id}: no account for customer ${sub.customerId}`);
    return null;
  }
  const data = {
    userId,
    customerId: sub.customerId,
    plan: sub.plan,
    interval: sub.interval,
    status: sub.status,
    priceId: sub.priceId,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  } satisfies Omit<Prisma.BillingSubscriptionUncheckedCreateInput, "id">;
  await prisma.billingSubscription.upsert({ where: { id: sub.id }, create: { id: sub.id, ...data }, update: data });
  await refreshUserPlan(userId);
  return userId;
}

export async function saveInvoice(inv: InvoiceState): Promise<void> {
  const userId = await userForCustomer(inv.customerId, null);
  if (!userId) return;
  const data = {
    userId,
    subscriptionId: inv.subscriptionId,
    number: inv.number,
    status: inv.status,
    amountDue: inv.amountDue,
    amountPaid: inv.amountPaid,
    currency: inv.currency,
    hostedUrl: inv.hostedUrl,
    pdfUrl: inv.pdfUrl,
    created: inv.created,
  } satisfies Omit<Prisma.BillingInvoiceUncheckedCreateInput, "id">;
  await prisma.billingInvoice.upsert({ where: { id: inv.id }, create: { id: inv.id, ...data }, update: data });
}

function parseSubscription(raw: unknown) {
  return subscriptionFromStripe(raw, priceToPlanFromEnv);
}

// ─── Webhook events ──────────────────────────────────────

export type WebhookOutcome = "applied" | "duplicate" | "ignored";

/** Applies one verified webhook event, once (BillingEvent keeps the ids already applied). */
export async function handleStripeEvent(event: StripeObject, cfg: StripeConfig | null): Promise<WebhookOutcome> {
  const id = typeof event.id === "string" ? event.id : null;
  const type = typeof event.type === "string" ? event.type : null;
  if (!id || !type) return "ignored";
  if (await prisma.billingEvent.findUnique({ where: { id }, select: { id: true } })) return "duplicate";

  const object = ((event.data as StripeObject | undefined)?.object ?? null) as StripeObject | null;
  let applied = false;
  switch (type) {
    case "checkout.session.completed": {
      if (object?.mode !== "subscription") break;
      const customerId = idOf(object.customer);
      const userId = typeof object.client_reference_id === "string" ? object.client_reference_id : null;
      if (customerId) await userForCustomer(customerId, userId);
      // The subscription comes in its own customer.subscription.* event; with
      // a key we fetch it now too, so the plan doesn't wait for that event.
      if (cfg && typeof object.id === "string") {
        await syncCheckoutSession(cfg, object.id, userId);
      }
      applied = true;
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      // Events can arrive out of order: with a key, store Stripe's current
      // state of the subscription rather than the event's snapshot.
      const fresh =
        cfg && typeof object?.id === "string"
          ? await retrieveSubscription(cfg, object.id).catch(() => object)
          : object;
      const sub = parseSubscription(fresh);
      if (sub) applied = (await saveSubscription(sub)) != null;
      break;
    }
    case "invoice.created":
    case "invoice.finalized":
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.voided":
    case "invoice.marked_uncollectible": {
      const inv = invoiceFromStripe(object);
      if (inv) {
        await saveInvoice(inv);
        applied = true;
      }
      break;
    }
    default:
      break;
  }

  // Record it even when ignored, so Stripe's retries are answered quickly.
  await prisma.billingEvent.create({ data: { id, type } }).catch(() => undefined);
  return applied ? "applied" : "ignored";
}

// ─── Syncs (no webhook needed) ───────────────────────────

/**
 * After the checkout redirect: reads the session from Stripe and stores its
 * subscription. `expectUserId` must match the session's account, so a
 * player can't attach someone else's session id to their account.
 */
export async function syncCheckoutSession(
  cfg: StripeConfig,
  sessionId: string,
  expectUserId: string | null
): Promise<boolean> {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return false;
  const session = await retrieveCheckoutSession(cfg, sessionId);
  const owner = typeof session.client_reference_id === "string" ? session.client_reference_id : null;
  if (!owner || (expectUserId && owner !== expectUserId)) return false;
  const customerId = idOf(session.customer);
  if (customerId) await userForCustomer(customerId, owner);
  const sub = parseSubscription(session.subscription);
  if (!sub) return false;
  return (await saveSubscription({ ...sub, userId: sub.userId ?? owner })) != null;
}

/** Pulls every subscription and the recent invoices of the account's customer. */
export async function syncCustomer(cfg: StripeConfig, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
  if (!user?.stripeCustomerId) return false;
  const [subs, invoices] = await Promise.all([
    listSubscriptions(cfg, user.stripeCustomerId),
    listInvoices(cfg, user.stripeCustomerId),
  ]);
  for (const raw of subs) {
    const sub = parseSubscription(raw);
    if (sub) await saveSubscription({ ...sub, userId: sub.userId ?? userId });
  }
  for (const raw of invoices) {
    const inv = invoiceFromStripe(raw);
    if (inv) await saveInvoice(inv);
  }
  await refreshUserPlan(userId);
  return true;
}

/**
 * Account deletion: ends the account's live subscriptions at once so a
 * deleted account is never charged again. Best effort; returns the failures.
 */
export async function cancelAllSubscriptions(userId: string): Promise<number> {
  const subs = await prisma.billingSubscription.findMany({
    where: { userId, status: { notIn: ["canceled", "incomplete_expired"] } },
    select: { id: true },
  });
  if (subs.length === 0) return 0;
  const cfg = stripeConfig();
  if (!cfg) return subs.length;
  let failed = 0;
  for (const s of subs) {
    await cancelSubscriptionNow(cfg, s.id).catch((err) => {
      failed++;
      console.error(`[billing] cancelling ${s.id} for deleted user=${userId} failed`, err);
    });
  }
  return failed;
}
