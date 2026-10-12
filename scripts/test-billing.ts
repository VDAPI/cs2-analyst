/**
 * Regression test for S30: payments (Stripe, test mode). Run: npm run test:billing
 *
 * No Stripe key, network or DB needed:
 * 1. Prices: amounts, yearly = 10 months, lookup keys, money formatting.
 * 2. Stripe form encoding and the test-mode-only key rule.
 * 3. Webhook signatures: valid, tampered, stale, several v1 entries.
 * 4. Subscription objects → plan (metadata, lookup key, env price; old and
 *    new API shapes), which statuses keep the plan, admin-set plans.
 * 5. Team seats: the owner's TEAM plan gives the next members Pro limits.
 * 6. Invoices: old and new subscription field, only Stripe https links.
 * 7. Pricing cards mirror PLAN_LIMITS; PL/EN copy for every status.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatMoney,
  parseLookupKey,
  priceAmount,
  priceEnvName,
  priceLookupKey,
  TEAM_SEATS,
  yearlySavingPercent,
} from "@/lib/billing/prices";
import {
  effectivePlan,
  grantsPlan,
  invoiceFromStripe,
  nextUserPlan,
  planFromSubscriptions,
  primarySubscription,
  safeStripeUrl,
  signStripePayload,
  stripeKeyAllowed,
  subscriptionFromStripe,
  teamSeatPlan,
  verifyStripeSignature,
} from "@/lib/billing/state";
import { formEncode } from "@/lib/billing/stripe";
import { planOffers } from "@/lib/billing/plans";
import { PLAN_LIMITS } from "@/lib/limits";
import { pl } from "@/lib/i18n/messages/pl";
import { en } from "@/lib/i18n/messages/en";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// ─── 1. Prices ─────────────────────────────────────────────
check("Pro is $6 a month", priceAmount("PRO", "month") === 600);
check("Team is $15 a month", priceAmount("TEAM", "month") === 1500);
check("yearly costs ten months", priceAmount("PRO", "year") === 6000 && priceAmount("TEAM", "year") === 15000);
check("yearly saving is 17%", yearlySavingPercent("PRO") === 17);
check("lookup key carries plan, interval and amount", priceLookupKey("TEAM", "year") === "cs2a_team_year_15000");
check(
  "lookup key parses back",
  JSON.stringify(parseLookupKey("cs2a_pro_month_600")) === JSON.stringify({ plan: "PRO", interval: "month" })
);
check("foreign lookup key is not ours", parseLookupKey("other_pro_month") === null && parseLookupKey(null) === null);
check("env price names", priceEnvName("PRO", "month") === "STRIPE_PRICE_PRO_MONTHLY" && priceEnvName("TEAM", "year") === "STRIPE_PRICE_TEAM_YEARLY");
check("money format", formatMoney(600) === "$6" && formatMoney(1250, "eur") === "€12.50" && formatMoney(500, "pln") === "5 PLN");

// ─── 2. Form encoding, keys ────────────────────────────────
check(
  "form encoding nests like Stripe",
  formEncode({ mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }], metadata: { userId: "u 1" }, x: undefined }) ===
    "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5BuserId%5D=u%201"
);
check("lookup_keys array encodes", formEncode({ lookup_keys: ["a"] }) === "lookup_keys%5B0%5D=a");
check("test key allowed", stripeKeyAllowed("sk_test_123", false) && stripeKeyAllowed("rk_test_1", false));
check("live key refused by default", !stripeKeyAllowed("sk_live_123", false));
check("live key only with STRIPE_ALLOW_LIVE", stripeKeyAllowed("sk_live_123", true));
check("publishable key never works as a secret", !stripeKeyAllowed("pk_test_123", true));

// ─── 3. Webhook signatures ─────────────────────────────────
const secret = "whsec_test_secret";
const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
const now = 1_760_000_000;
const sig = signStripePayload(payload, secret, now);
check("valid signature passes", verifyStripeSignature(payload, `t=${now},v1=${sig}`, secret, now));
check("one of several v1 matching passes", verifyStripeSignature(payload, `t=${now},v1=${"0".repeat(64)},v1=${sig}`, secret, now));
check("tampered body fails", !verifyStripeSignature(payload.replace("evt_1", "evt_2"), `t=${now},v1=${sig}`, secret, now));
check("wrong secret fails", !verifyStripeSignature(payload, `t=${now},v1=${sig}`, "whsec_other", now));
check("stale timestamp fails (replay)", !verifyStripeSignature(payload, `t=${now},v1=${sig}`, secret, now + 301));
check("missing header fails", !verifyStripeSignature(payload, null, secret, now) && !verifyStripeSignature(payload, "garbage", secret, now));
check("v0 only fails", !verifyStripeSignature(payload, `t=${now},v0=${sig}`, secret, now));

// ─── 4. Subscriptions → plan ───────────────────────────────
const subWithMeta = {
  object: "subscription",
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  cancel_at_period_end: false,
  metadata: { userId: "user_1", plan: "PRO", interval: "year" },
  items: { data: [{ price: { id: "price_x", recurring: { interval: "year" } }, current_period_end: now + 86400 }] },
};
const s1 = subscriptionFromStripe(subWithMeta);
check("metadata gives plan and account", s1?.plan === "PRO" && s1.userId === "user_1" && s1.interval === "year");
check("period end read from the item (new API)", s1?.currentPeriodEnd?.getTime() === (now + 86400) * 1000);
const subOld = {
  object: "subscription",
  id: "sub_2",
  customer: { id: "cus_2", object: "customer" },
  status: "past_due",
  current_period_end: now,
  cancel_at_period_end: true,
  metadata: {},
  items: { data: [{ price: { id: "price_y", lookup_key: "cs2a_team_month_1500", recurring: { interval: "month" } } }] },
};
const s2 = subscriptionFromStripe(subOld);
check("lookup key gives plan (no metadata), expanded customer", s2?.plan === "TEAM" && s2.customerId === "cus_2" && s2.userId === null);
check("period end on the subscription (old API), cancel flag", s2?.currentPeriodEnd?.getTime() === now * 1000 && s2.cancelAtPeriodEnd);
const foreign = { ...subOld, id: "sub_3", items: { data: [{ price: { id: "price_z", recurring: { interval: "month" } } }] } };
check("someone else's price is not ours", subscriptionFromStripe(foreign) === null);
check(
  "dashboard price from env maps",
  subscriptionFromStripe(foreign, (id) => (id === "price_z" ? { plan: "PRO", interval: "month" } : null))?.plan === "PRO"
);
check("not a subscription", subscriptionFromStripe({ object: "invoice", id: "in_1" }) === null && subscriptionFromStripe(null) === null);

check("active, trialing, past_due keep the plan", ["active", "trialing", "past_due"].every(grantsPlan));
check("canceled, unpaid, incomplete, paused drop it", !["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"].some(grantsPlan));
check("highest granting plan wins", planFromSubscriptions([{ plan: "PRO", status: "active" }, { plan: "TEAM", status: "trialing" }]) === "TEAM");
check("canceled Team, active Pro → Pro", planFromSubscriptions([{ plan: "TEAM", status: "canceled" }, { plan: "PRO", status: "active" }]) === "PRO");
check("all canceled → Free", planFromSubscriptions([{ plan: "PRO", status: "canceled" }]) === "FREE");
check("no subscriptions keep an admin-set plan", nextUserPlan("PRO", []) === "PRO");
check("once Stripe knows the account, Stripe decides", nextUserPlan("TEAM", [{ plan: "PRO", status: "canceled" }]) === "FREE");
const d = (n: number) => new Date(now * 1000 + n);
check(
  "primary subscription: granting before newer canceled",
  primarySubscription([
    { id: "a", status: "canceled", plan: "TEAM" as const, updatedAt: d(2) },
    { id: "b", status: "active", plan: "PRO" as const, updatedAt: d(1) },
  ])?.id === "b"
);
check("primary subscription of none", primarySubscription([]) === null);

// ─── 5. Team seats ─────────────────────────────────────────
const members = ["owner", "m1", "m2", "m3", "m4", "m5"].map((userId, i) => ({ userId, joinedAt: d(i * 1000) }));
const team = { ownerId: "owner", ownerPlan: "TEAM" as const, members: [...members].reverse() };
check(`Team covers ${TEAM_SEATS} accounts: the 4 earliest members get Pro`, ["m1", "m2", "m3", "m4"].every((u) => teamSeatPlan(u, [team]) === "PRO"));
check("the 5th member gets nothing", teamSeatPlan("m5", [team]) === null);
check("the owner keeps their own plan (no seat)", teamSeatPlan("owner", [team]) === null);
check("an owner on Pro gives no seats", teamSeatPlan("m1", [{ ...team, ownerPlan: "PRO" }]) === null);
check("seat lifts Free to Pro", effectivePlan("FREE", "PRO") === "PRO");
check("seat never lowers a Team account", effectivePlan("TEAM", "PRO") === "TEAM" && effectivePlan("PRO", null) === "PRO");

// ─── 6. Invoices ───────────────────────────────────────────
const inv = invoiceFromStripe({
  object: "invoice",
  id: "in_1",
  customer: "cus_1",
  number: "ABC-0001",
  status: "paid",
  amount_due: 600,
  amount_paid: 600,
  currency: "usd",
  created: now,
  hosted_invoice_url: "https://invoice.stripe.com/i/acct_1/test_1",
  invoice_pdf: "https://pay.stripe.com/invoice/acct_1/test_1/pdf",
  parent: { subscription_details: { subscription: "sub_1" } },
});
check("invoice parsed with the new subscription field", inv?.subscriptionId === "sub_1" && inv.amountPaid === 600 && inv.number === "ABC-0001");
check("Stripe invoice links kept", inv?.hostedUrl?.startsWith("https://invoice.stripe.com/") === true && inv.pdfUrl != null);
check(
  "invoice with the old subscription field",
  invoiceFromStripe({ object: "invoice", id: "in_2", customer: "cus_1", subscription: "sub_9", created: now })?.subscriptionId === "sub_9"
);
check("non-Stripe or http links dropped", safeStripeUrl("https://evil.example/stripe.com") === null && safeStripeUrl("http://invoice.stripe.com/x") === null && safeStripeUrl("https://stripe.com.evil.io/x") === null);

// ─── 7. Pricing cards, copy, wiring ────────────────────────
const offers = planOffers();
check("three plans on the cards", offers.map((o) => o.plan).join() === "FREE,PRO,TEAM");
check(
  "cards mirror PLAN_LIMITS",
  offers.every(
    (o) =>
      o.keptDemos === PLAN_LIMITS[o.plan].keptDemos &&
      o.batchSize === PLAN_LIMITS[o.plan].batchSize &&
      (o.monthlyDemos ?? Infinity) === PLAN_LIMITS[o.plan].monthlyDemos
  )
);
check("Free costs nothing, Pro is highlighted", offers[0].price.month === 0 && offers[1].highlight);
check("Team card counts the extra seats", offers[2].seats === TEAM_SEATS - 1);
check("PL and EN billing copy have the same keys", JSON.stringify(Object.keys(pl.billing).sort()) === JSON.stringify(Object.keys(en.billing).sort()));
check("every billing string is non-empty", Object.values(pl.billing).every(Boolean) && Object.values(en.billing).every(Boolean));

const root = process.cwd();
const webhook = readFileSync(join(root, "src/app/api/billing/webhook/route.ts"), "utf8");
check(
  "webhook verifies the signature before parsing the body",
  webhook.indexOf("verifyStripeSignature(") > 0 && webhook.indexOf("verifyStripeSignature(") < webhook.indexOf("JSON.parse(")
);
check("webhook ignores live events unless live payments are on", webhook.includes("livemode") && webhook.includes("STRIPE_ALLOW_LIVE"));
const checkout = readFileSync(join(root, "src/app/api/billing/checkout/route.ts"), "utf8");
check("checkout refuses a second subscription", checkout.includes("has_subscription"));
check("account deletion cancels subscriptions", readFileSync(join(root, "src/lib/account/delete.ts"), "utf8").includes("cancelAllSubscriptions"));

// ─── Report ────────────────────────────────────────────────
let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exit(1);
