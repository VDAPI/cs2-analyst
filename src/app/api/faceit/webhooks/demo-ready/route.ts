import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/faceit/webhooks/demo-ready
 *
 * FACEIT calls this when a match demo becomes available. We verify a shared
 * secret, flip the FaceitMatch to AVAILABLE, and return 200 immediately.
 *
 * Lives under /api/faceit/* (NOT /api/auth/*) to avoid the NextAuth
 * [...nextauth] catch-all. No downloads are enqueued here yet.
 */

const SECRET_HEADER = "x-faceit-webhook-secret";

function secretMatches(provided: string | null): boolean {
  const expected = process.env.FACEIT_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal lengths; length isn't secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function extractMatchId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const payload = (b.payload ?? {}) as Record<string, unknown>;
  const candidate =
    payload.id ?? payload.match_id ?? b.match_id ?? b.id ?? null;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get(SECRET_HEADER))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const faceitMatchId = extractMatchId(body);
  if (!faceitMatchId) {
    return NextResponse.json({ error: "Missing match id" }, { status: 400 });
  }

  // updateMany — no-op (count 0) if we don't track this match; never throws.
  const { count } = await prisma.faceitMatch.updateMany({
    where: { faceitMatchId },
    data: { demoStatus: "AVAILABLE" },
  });

  console.log(
    `[faceit-webhook] demo-ready faceitMatchId=${faceitMatchId} updated=${count}`
  );

  return NextResponse.json({ ok: true, updated: count }, { status: 200 });
}
