/**
 * Payments (S30), pure part: Stripe objects → our subscription rows, which
 * plan a set of subscriptions grants, Team seats and webhook signatures.
 * No Stripe or DB access, so `npm run test:billing` covers it without keys.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Plan } from "@prisma/client";
import {
  isBillingInterval,
  isPaidPlan,
  parseLookupKey,
  PLAN_RANK,
  TEAM_SEATS,
  type BillingInterval,
  type PaidPlan,
} from "./prices";

// ─── Subscriptions ───────────────────────────────────────

export interface SubscriptionState {
  id: string;
  customerId: string;
  /** Our account, from the subscription's metadata (null when it has none). */
  userId: string | null;
  plan: PaidPlan;
  interval: BillingInterval;
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Statuses that keep the paid plan. past_due keeps it while Stripe retries
 * the card (smart retries end in canceled or unpaid, which drop it).
 */
export const GRANTING_STATUSES = new Set(["active", "trialing", "past_due"]);

export function grantsPlan(status: string): boolean {
  return GRANTING_STATUSES.has(status);
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** An expandable field: the id, or the expanded object's id. */
export function idOf(v: unknown): string | null {
  return str(v) ?? str(obj(v)?.id);
}

function unixDate(v: unknown): Date | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? new Date(v * 1000) : null;
}

/**
 * A Stripe subscription object as our row, or null when it is not one of
 * ours (no plan in the metadata and a price we did not make). The plan comes
 * from `metadata.plan` (set at checkout), else the price's lookup key, else
 * `priceToPlan` (dashboard prices from STRIPE_PRICE_* env vars).
 */
export function subscriptionFromStripe(
  raw: unknown,
  priceToPlan: (priceId: string) => { plan: PaidPlan; interval: BillingInterval } | null = () => null
): SubscriptionState | null {
  const sub = obj(raw);
  if (!sub || sub.object !== "subscription") return null;
  const id = str(sub.id);
  const customerId = idOf(sub.customer);
  const status = str(sub.status);
  if (!id || !customerId || !status) return null;

  const items = obj(sub.items);
  const firstItem = Array.isArray(items?.data) ? obj(items.data[0]) : null;
  const price = obj(firstItem?.price) ?? obj(sub.plan);
  const priceId = str(price?.id);
  const recurring = obj(price?.recurring);

  const meta = obj(sub.metadata) ?? {};
  const fromKey = parseLookupKey(str(price?.lookup_key));
  const fromEnv = priceId ? priceToPlan(priceId) : null;
  const plan = isPaidPlan(meta.plan) ? meta.plan : (fromKey?.plan ?? fromEnv?.plan);
  if (!plan) return null;
  const intervalRaw = recurring?.interval ?? price?.interval ?? meta.interval;
  const interval: BillingInterval = isBillingInterval(intervalRaw)
    ? intervalRaw
    : (fromKey?.interval ?? fromEnv?.interval ?? "month");

  // current_period_end moved from the subscription to its items in newer API versions.
  const periodEnd = unixDate(sub.current_period_end) ?? unixDate(firstItem?.current_period_end);

  return {
    id,
    customerId,
    userId: str(meta.userId),
    plan,
    interval,
    status,
    priceId,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end === true || unixDate(sub.cancel_at) != null,
  };
}

/** The highest plan any of these subscriptions grants; FREE when none does. */
export function planFromSubscriptions(subs: { plan: Plan; status: string }[]): Plan {
  let best: Plan = "FREE";
  for (const s of subs) {
    if (grantsPlan(s.status) && PLAN_RANK[s.plan] > PLAN_RANK[best]) best = s.plan;
  }
  return best;
}

/**
 * The plan an account should have after its subscriptions changed. With no
 * subscription rows at all the stored plan stays (an admin may have set it
 * by hand on /admin/users); once Stripe knows the account, Stripe decides.
 */
export function nextUserPlan(current: Plan, subs: { plan: Plan; status: string }[]): Plan {
  return subs.length === 0 ? current : planFromSubscriptions(subs);
}

/** The one subscription to show and manage: a granting one first, then the newest. */
export function primarySubscription<T extends { status: string; plan: Plan; updatedAt: Date }>(subs: T[]): T | null {
  const sorted = [...subs].sort(
    (a, b) =>
      Number(grantsPlan(b.status)) - Number(grantsPlan(a.status)) ||
      PLAN_RANK[b.plan] - PLAN_RANK[a.plan] ||
      b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  return sorted[0] ?? null;
}

// ─── Team seats ──────────────────────────────────────────

export interface SeatTeam {
  /** Members of one team, any order. `ownerPlan` is the plan of the team's OWNER. */
  members: { userId: string; joinedAt: Date }[];
  ownerId: string;
  ownerPlan: Plan;
}

/**
 * Pro limits through a Team subscription: the owner of a team on the TEAM
 * plan shares it with the earliest members of that team, up to TEAM_SEATS
 * accounts including the owner. Returns "PRO" for a seated member, else null.
 */
export function teamSeatPlan(userId: string, teams: SeatTeam[], seats: number = TEAM_SEATS): Plan | null {
  for (const team of teams) {
    if (team.ownerPlan !== "TEAM" || team.ownerId === userId) continue;
    const others = team.members
      .filter((m) => m.userId !== team.ownerId)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.userId.localeCompare(b.userId))
      .slice(0, Math.max(0, seats - 1));
    if (others.some((m) => m.userId === userId)) return "PRO";
  }
  return null;
}

/** The plan whose limits apply: the account's own, or a Team seat when that is higher. */
export function effectivePlan(own: Plan, seat: Plan | null): Plan {
  return seat && PLAN_RANK[seat] > PLAN_RANK[own] ? seat : own;
}

// ─── Webhook signatures ──────────────────────────────────

/** Seconds a signed webhook stays valid (Stripe's own default). */
export const WEBHOOK_TOLERANCE_S = 300;

/**
 * Checks the `Stripe-Signature` header: `t=<unix>,v1=<hex>[,v1=…]`, where v1
 * is HMAC-SHA256 of `<t>.<raw body>` with the endpoint secret. Rejects
 * timestamps older (or newer) than the tolerance, against replays.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowS: number = Math.floor(Date.now() / 1000),
  toleranceS: number = WEBHOOK_TOLERANCE_S
): boolean {
  if (!header || !secret) return false;
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((x) => x.trim());
    if (k === "t" && /^\d+$/.test(v ?? "")) t = Number(v);
    if (k === "v1" && /^[0-9a-f]{64}$/i.test(v ?? "")) sigs.push(v.toLowerCase());
  }
  if (t == null || sigs.length === 0 || Math.abs(nowS - t) > toleranceS) return false;
  const expected = Buffer.from(signStripePayload(payload, secret, t), "hex");
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** The v1 signature for a payload (tests and the E2E seed sign events with it). */
export function signStripePayload(payload: string, secret: string, t: number): string {
  return createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
}

// ─── Invoices ────────────────────────────────────────────

export interface InvoiceState {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  number: string | null;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
  created: Date;
}

export function invoiceFromStripe(raw: unknown): InvoiceState | null {
  const inv = obj(raw);
  if (!inv || inv.object !== "invoice") return null;
  const id = str(inv.id);
  const customerId = idOf(inv.customer);
  const created = unixDate(inv.created);
  if (!id || !customerId || !created) return null;
  // The subscription moved under parent.subscription_details in newer API versions.
  const parentSub = obj(obj(inv.parent)?.subscription_details)?.subscription;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);
  return {
    id,
    customerId,
    subscriptionId: idOf(inv.subscription) ?? idOf(parentSub),
    number: str(inv.number),
    status: str(inv.status) ?? "draft",
    amountDue: num(inv.amount_due),
    amountPaid: num(inv.amount_paid),
    currency: str(inv.currency) ?? "usd",
    hostedUrl: safeStripeUrl(inv.hosted_invoice_url),
    pdfUrl: safeStripeUrl(inv.invoice_pdf),
    created,
  };
}

/** Only https links on Stripe's own domains are stored and shown as links. */
export function safeStripeUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && /(^|\.)stripe\.com$/.test(u.hostname) ? s : null;
  } catch {
    return null;
  }
}

/** Test-mode keys only, unless live payments are switched on explicitly. */
export function stripeKeyAllowed(key: string, allowLive: boolean): boolean {
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return true;
  return allowLive && (key.startsWith("sk_live_") || key.startsWith("rk_live_"));
}
