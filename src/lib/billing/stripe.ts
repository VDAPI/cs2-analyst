/**
 * A small Stripe REST client (S30): form-encoded requests with the secret
 * key, no SDK (same idea as the hand-rolled R2 client). Server only.
 *
 * Test mode is the default: a live key is refused unless STRIPE_ALLOW_LIVE=1.
 */
import {
  BILLING_CURRENCY,
  PAID_PLANS,
  BILLING_INTERVALS,
  priceAmount,
  priceEnvName,
  priceLookupKey,
  type BillingInterval,
  type PaidPlan,
} from "./prices";
import { stripeKeyAllowed } from "./state";

const API = "https://api.stripe.com/v1";
/** Pinned so object shapes don't change under us (state.ts reads both old and new fields anyway). */
const API_VERSION = "2024-06-20";

export type StripeObject = Record<string, unknown>;

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null
  ) {
    super(message);
  }
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string | null;
  live: boolean;
}

/** null when payments are off: no key, or a live key without STRIPE_ALLOW_LIVE=1. */
export function stripeConfig(): StripeConfig | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!stripeKeyAllowed(key, process.env.STRIPE_ALLOW_LIVE === "1")) {
    console.warn("[billing] STRIPE_SECRET_KEY is a live key; set STRIPE_ALLOW_LIVE=1 to take real payments");
    return null;
  }
  return {
    secretKey: key,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
    live: key.includes("_live_"),
  };
}

type Param = string | number | boolean | null | undefined | Param[] | { [k: string]: Param };

/** Stripe's bracket form encoding: a[b][0][c]=x. Pure. */
export function formEncode(params: Record<string, Param>): string {
  const out: string[] = [];
  const walk = (prefix: string, v: Param) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${prefix}[${i}]`, x));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(`${prefix}[${k}]`, x);
    else out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(v))}`);
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return out.join("&");
}

async function stripeRequest(
  cfg: StripeConfig,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, Param> = {},
  idempotencyKey?: string
): Promise<StripeObject> {
  const body = formEncode(params);
  const url = method === "POST" || !body ? `${API}${path}` : `${API}${path}?${body}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.secretKey}`,
    "Stripe-Version": API_VERSION,
  };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as StripeObject;
  if (!res.ok) {
    const err = (json.error ?? {}) as { message?: string; code?: string };
    throw new StripeError(err.message ?? `Stripe ${res.status}`, res.status, err.code ?? null);
  }
  return json;
}

function list(o: StripeObject): StripeObject[] {
  return Array.isArray(o.data) ? (o.data as StripeObject[]) : [];
}

// ─── Customers ───────────────────────────────────────────

export function createCustomer(cfg: StripeConfig, user: { id: string; email: string | null; name: string | null }) {
  return stripeRequest(
    cfg,
    "POST",
    "/customers",
    { email: user.email ?? undefined, name: user.name ?? undefined, metadata: { userId: user.id } },
    `customer:${user.id}`
  );
}

// ─── Prices ──────────────────────────────────────────────

const priceCache = new Map<string, string>();

/**
 * The Stripe price id for a plan: STRIPE_PRICE_* when set, otherwise the
 * price with our lookup key, created (with its product) on first use.
 */
export async function ensurePrice(cfg: StripeConfig, plan: PaidPlan, interval: BillingInterval): Promise<string> {
  const fromEnv = process.env[priceEnvName(plan, interval)]?.trim();
  if (fromEnv) return fromEnv;
  const key = priceLookupKey(plan, interval);
  const cached = priceCache.get(key);
  if (cached) return cached;

  const found = list(await stripeRequest(cfg, "GET", "/prices", { lookup_keys: [key], active: true, limit: 1 }))[0];
  let id = typeof found?.id === "string" ? found.id : null;
  if (!id) {
    const product = await productFor(cfg, plan);
    const price = await stripeRequest(
      cfg,
      "POST",
      "/prices",
      {
        product,
        currency: BILLING_CURRENCY,
        unit_amount: priceAmount(plan, interval),
        recurring: { interval },
        lookup_key: key,
        metadata: { plan, interval },
      },
      `price:${key}`
    );
    id = String(price.id);
  }
  priceCache.set(key, id);
  return id;
}

async function productFor(cfg: StripeConfig, plan: PaidPlan): Promise<string> {
  const found = await stripeRequest(cfg, "GET", "/products/search", {
    query: `metadata['cs2a_plan']:'${plan}' AND active:'true'`,
    limit: 1,
  }).catch(() => ({ data: [] }) as StripeObject);
  const existing = list(found)[0];
  if (typeof existing?.id === "string") return existing.id;
  const product = await stripeRequest(
    cfg,
    "POST",
    "/products",
    { name: `CS2 Analyst ${plan === "PRO" ? "Pro" : "Team"}`, metadata: { cs2a_plan: plan } },
    `product:${plan}`
  );
  return String(product.id);
}

/** Dashboard prices from STRIPE_PRICE_* env vars, for subscriptions without our metadata. */
export function priceToPlanFromEnv(priceId: string): { plan: PaidPlan; interval: BillingInterval } | null {
  for (const plan of PAID_PLANS) {
    for (const interval of BILLING_INTERVALS) {
      if (process.env[priceEnvName(plan, interval)]?.trim() === priceId) return { plan, interval };
    }
  }
  return null;
}

// ─── Checkout and portal ─────────────────────────────────

export interface CheckoutInput {
  userId: string;
  customerId: string;
  plan: PaidPlan;
  interval: BillingInterval;
  origin: string;
  locale: "pl" | "en";
}

export async function createCheckoutSession(cfg: StripeConfig, input: CheckoutInput): Promise<string> {
  const price = await ensurePrice(cfg, input.plan, input.interval);
  const meta = { userId: input.userId, plan: input.plan, interval: input.interval };
  const session = await stripeRequest(cfg, "POST", "/checkout/sessions", {
    mode: "subscription",
    customer: input.customerId,
    client_reference_id: input.userId,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: meta },
    metadata: meta,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    locale: input.locale,
    success_url: `${input.origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/billing?checkout=cancel`,
  });
  if (typeof session.url !== "string") throw new StripeError("Checkout session without url", 502, null);
  return session.url;
}

export async function createPortalSession(cfg: StripeConfig, customerId: string, returnUrl: string): Promise<string> {
  const session = await stripeRequest(cfg, "POST", "/billing_portal/sessions", {
    customer: customerId,
    return_url: returnUrl,
  });
  if (typeof session.url !== "string") throw new StripeError("Portal session without url", 502, null);
  return session.url;
}

export function retrieveCheckoutSession(cfg: StripeConfig, id: string) {
  return stripeRequest(cfg, "GET", `/checkout/sessions/${encodeURIComponent(id)}`, { expand: ["subscription"] });
}

// ─── Subscriptions and invoices ──────────────────────────

export async function listSubscriptions(cfg: StripeConfig, customerId: string): Promise<StripeObject[]> {
  return list(await stripeRequest(cfg, "GET", "/subscriptions", { customer: customerId, status: "all", limit: 20 }));
}

export async function listInvoices(cfg: StripeConfig, customerId: string): Promise<StripeObject[]> {
  return list(await stripeRequest(cfg, "GET", "/invoices", { customer: customerId, limit: 24 }));
}

export function retrieveSubscription(cfg: StripeConfig, id: string) {
  return stripeRequest(cfg, "GET", `/subscriptions/${encodeURIComponent(id)}`);
}

/** Ends a subscription now (account deletion). */
export function cancelSubscriptionNow(cfg: StripeConfig, id: string) {
  return stripeRequest(cfg, "DELETE", `/subscriptions/${encodeURIComponent(id)}`);
}
