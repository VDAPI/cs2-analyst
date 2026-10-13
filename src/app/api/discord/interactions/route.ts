import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { prismaDiscordDeps } from "@/lib/discord/data";
import { handleInteraction, type Interaction } from "@/lib/discord/handler";
import { discordConfig } from "@/lib/discord/rest";
import { verifyDiscordSignature } from "@/lib/discord/signature";

/**
 * POST /api/discord/interactions — slash commands over HTTP (S26; public,
 * guarded by the Ed25519 signature with DISCORD_PUBLIC_KEY). Used when the
 * app has an "Interactions Endpoint URL" in the Discord developer portal
 * (a public https server); locally the gateway bot (`npm run worker:discord`)
 * answers instead and this route is never called.
 */
export async function POST(req: Request) {
  const { publicKey } = discordConfig();
  if (!publicKey) return NextResponse.json({ error: "Discord is not configured" }, { status: 503 });

  const body = await req.text();
  const ok = verifyDiscordSignature({
    publicKeyHex: publicKey,
    signature: req.headers.get("x-signature-ed25519"),
    timestamp: req.headers.get("x-signature-timestamp"),
    body,
  });
  if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  let interaction: Interaction;
  try {
    interaction = JSON.parse(body) as Interaction;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  return NextResponse.json(await handleInteraction(interaction, prismaDiscordDeps(prisma)));
}
