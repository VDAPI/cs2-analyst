import { NextResponse } from "next/server";
import { handleStripeEvent } from "@/lib/billing/persist";
import { verifyStripeSignature } from "@/lib/billing/state";
import { stripeConfig, type StripeObject } from "@/lib/billing/stripe";

/**
 * POST /api/billing/webhook — Stripe events (public; guarded by the
 * Stripe-Signature HMAC with STRIPE_WEBHOOK_SECRET). Each event is applied
 * once. Works without STRIPE_SECRET_KEY too: subscription events carry the
 * whole object, which is all the plan needs.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhooks are not configured" }, { status: 503 });

  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  let event: StripeObject;
  try {
    event = JSON.parse(payload) as StripeObject;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  // Test mode unless live payments are switched on (the same rule as the key).
  if (event.livemode === true && process.env.STRIPE_ALLOW_LIVE !== "1") {
    return NextResponse.json({ received: true, outcome: "ignored" });
  }
  const cfg = stripeConfig();

  try {
    const outcome = await handleStripeEvent(event, cfg);
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    console.error(`[billing] webhook ${String(event.type)} failed`, err);
    // 500 makes Stripe retry later.
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
