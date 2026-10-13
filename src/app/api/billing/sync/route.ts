import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { syncCustomer } from "@/lib/billing/persist";
import { stripeConfig } from "@/lib/billing/stripe";

/**
 * POST /api/billing/sync — "Odśwież status": reads the account's
 * subscriptions and invoices straight from Stripe (for a setup whose
 * webhooks don't reach the app, e.g. a local test without `stripe listen`).
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("billing", userId);
  if (limited) return limited;

  const cfg = stripeConfig();
  if (!cfg) return NextResponse.json({ error: "Payments are not configured", code: "not_configured" }, { status: 503 });
  try {
    await syncCustomer(cfg, userId);
  } catch (err) {
    console.error("[billing] sync failed", err);
    return NextResponse.json({ error: "Could not reach Stripe", code: "stripe_error" }, { status: 502 });
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return NextResponse.json({ plan: user?.plan ?? "FREE" });
}
