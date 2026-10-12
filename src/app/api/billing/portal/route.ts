import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { requestOrigin } from "@/lib/billing/http";
import { createPortalSession, stripeConfig } from "@/lib/billing/stripe";

/**
 * POST /api/billing/portal — Stripe's customer portal (change or cancel the
 * plan, card, invoices with tax details). Needs a customer, i.e. one checkout.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("billing", session.user.id);
  if (limited) return limited;

  const cfg = stripeConfig();
  if (!cfg) return NextResponse.json({ error: "Payments are not configured", code: "not_configured" }, { status: 503 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { stripeCustomerId: true } });
  if (!user?.stripeCustomerId) return NextResponse.json({ error: "No billing account yet", code: "no_customer" }, { status: 404 });

  try {
    const url = await createPortalSession(cfg, user.stripeCustomerId, `${requestOrigin(req)}/billing`);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[billing] portal failed", err);
    return NextResponse.json({ error: "Could not open the billing portal", code: "stripe_error" }, { status: 502 });
  }
}
