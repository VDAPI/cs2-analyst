import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getLocale } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { requestOrigin } from "@/lib/billing/http";
import { grantsPlan } from "@/lib/billing/state";
import { createCheckoutSession, createCustomer, stripeConfig, StripeError } from "@/lib/billing/stripe";

const bodySchema = z.object({
  plan: z.enum(["PRO", "TEAM"]),
  interval: z.enum(["month", "year"]),
});

/**
 * POST /api/billing/checkout — starts a Stripe Checkout for a plan and
 * returns its url. An account that already pays is sent to the customer
 * portal instead (409 `has_subscription`), so it never gets two subscriptions.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("billing", userId);
  if (limited) return limited;

  const cfg = stripeConfig();
  if (!cfg) return NextResponse.json({ error: "Payments are not configured", code: "not_configured" }, { status: 503 });

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, stripeCustomerId: true, subscriptions: { select: { status: true } } },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.subscriptions.some((s) => grantsPlan(s.status))) {
    return NextResponse.json({ error: "Already subscribed", code: "has_subscription" }, { status: 409 });
  }

  try {
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await createCustomer(cfg, user);
      customerId = String(customer.id);
      // Two quick clicks may both get here: keep whichever link landed first.
      const linked = await prisma.user.updateMany({
        where: { id: userId, stripeCustomerId: null },
        data: { stripeCustomerId: customerId },
      });
      if (linked.count === 0) {
        customerId = (await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } }))
          ?.stripeCustomerId ?? customerId;
      }
    }
    const url = await createCheckoutSession(cfg, {
      userId,
      customerId,
      plan: body.data.plan,
      interval: body.data.interval,
      origin: requestOrigin(req),
      locale: await getLocale(),
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[billing] checkout failed", err);
    const status = err instanceof StripeError && err.status < 500 ? 400 : 502;
    return NextResponse.json({ error: "Could not start the payment", code: "stripe_error" }, { status });
  }
}
