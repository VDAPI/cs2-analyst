import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { maskWebhookUrl, normalizeWebhookUrl } from "@/lib/discord/link";
import { rateLimit } from "@/lib/security/rate-limit-http";

const schema = z.object({
  notify: z.boolean().optional(),
  /** A channel webhook URL, or null / "" to remove it. */
  webhookUrl: z.string().max(300).nullable().optional(),
});

/** PATCH /api/discord/settings — Discord notifications on/off and the channel webhook (S26). */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const data: { discordNotify?: boolean; discordWebhookUrl?: string | null } = {};
  if (body.data.notify !== undefined) data.discordNotify = body.data.notify;
  if (body.data.webhookUrl !== undefined) {
    const raw = body.data.webhookUrl?.trim() ?? "";
    if (raw === "") data.discordWebhookUrl = null;
    else {
      const url = normalizeWebhookUrl(raw);
      if (!url) return NextResponse.json({ error: "invalid_webhook" }, { status: 400 });
      data.discordWebhookUrl = url;
    }
  }
  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { discordNotify: true, discordWebhookUrl: true },
  });
  return NextResponse.json({
    notify: user.discordNotify,
    webhook: user.discordWebhookUrl ? maskWebhookUrl(user.discordWebhookUrl) : null,
  });
}
