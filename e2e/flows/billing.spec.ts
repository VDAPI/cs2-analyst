/**
 * S30: a test-mode payment raises the limit. Stripe itself is not reachable
 * from the suite, so the flow sends what Stripe sends after a checkout: a
 * signed customer.subscription.* webhook for the E2E account. Then the
 * subscription ends and the account is back on Free.
 */
import { signStripePayload } from "../../src/lib/billing/state";
import { e2eEnv } from "../env";
import { expect, test } from "../fixtures";

function subscriptionEvent(type: string, userId: string, status: string, runId: string) {
  return JSON.stringify({
    id: `evt_e2e_${type}_${runId}`,
    object: "event",
    type,
    livemode: false,
    data: {
      object: {
        object: "subscription",
        id: `sub_e2e_${runId}`,
        customer: `cus_e2e_${runId}`,
        status,
        cancel_at_period_end: false,
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        metadata: { userId, plan: "PRO", interval: "month" },
        items: { data: [{ price: { id: "price_e2e", lookup_key: "cs2a_pro_month_600", recurring: { interval: "month" } } }] },
      },
    },
  });
}

test("testowa płatność podnosi limit", async ({ page, seed }, testInfo) => {
  // The plan is per account: the desktop and mobile runs share it, so only one of them changes it.
  test.skip(testInfo.project.name !== "desktop-flows", "the plan is per account");
  const runId = `${Date.now()}`;
  const send = async (body: string, signed = true) => {
    const t = Math.floor(Date.now() / 1000);
    const sig = signStripePayload(body, signed ? e2eEnv.STRIPE_WEBHOOK_SECRET : "whsec_wrong", t);
    return page.request.post("/api/billing/webhook", {
      data: body,
      headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` },
    });
  };

  // A forged event (wrong secret) changes nothing.
  expect((await send(subscriptionEvent("customer.subscription.created", seed.userId, "active", runId), false)).status()).toBe(400);

  const created = await send(subscriptionEvent("customer.subscription.created", seed.userId, "active", runId));
  expect(created.ok()).toBe(true);
  expect(await created.json()).toMatchObject({ outcome: "applied" });
  // Stripe retries: the same event again is a no-op.
  expect(await (await send(subscriptionEvent("customer.subscription.created", seed.userId, "active", runId))).json()).toMatchObject({
    outcome: "duplicate",
  });

  await page.goto("/billing");
  const current = page.getByTestId("billing-current");
  await expect(current).toContainText("Pro");
  await expect(current).toContainText("Aktywna");
  // The account's monthly limit is an admin override (seed), so the kept-demos
  // limit shows the plan: Free 3, Pro 50.
  await expect(page.getByText(/^\d+\/50$/)).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByText(/^\d+\/50$/)).toBeVisible();

  // Cancelled: back to the free plan's limit.
  const deleted = await send(subscriptionEvent("customer.subscription.deleted", seed.userId, "canceled", runId));
  expect(deleted.ok()).toBe(true);
  await page.goto("/billing");
  await expect(page.getByTestId("billing-current")).toContainText("Darmowy");
  await expect(page.getByText(/^\d+\/3$/)).toBeVisible();
});
