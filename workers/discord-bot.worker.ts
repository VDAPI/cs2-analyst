/**
 * Discord bot (S26). Runs as a separate process via `npm run worker:discord`.
 *
 * Connects to the Discord gateway with DISCORD_BOT_TOKEN, (re)registers the
 * slash commands on start and answers /stats, /ostatni-mecz, /polacz and
 * /rozlacz through the shared handler (src/lib/discord/handler.ts). Needs no
 * public URL, so it works on a home PC and in the local Docker setup.
 * "Analysis ready" messages are sent by the parse workers, not by this process.
 *
 * Without a token it logs how to set one up and idles, so the Docker service
 * doesn't restart in a loop.
 */
import { PrismaClient } from "@prisma/client";
import { COMMANDS } from "../src/lib/discord/commands";
import { prismaDiscordDeps } from "../src/lib/discord/data";
import { DiscordGateway } from "../src/lib/discord/gateway";
import { handleInteraction } from "../src/lib/discord/handler";
import { discordConfig, registerCommands, respondToInteraction } from "../src/lib/discord/rest";
import { initWorkerSentry } from "../src/lib/monitoring/worker-sentry";

initWorkerSentry("worker-discord");

const config = discordConfig();

if (!config.botToken) {
  console.log(
    "[discord] DISCORD_BOT_TOKEN is not set: the bot is off. See docs/TESTOWANIE.md (Discord) to create a bot and set the token."
  );
  // Idle instead of exiting (a restarting container would loop).
  setInterval(() => {}, 24 * 60 * 60 * 1000);
} else {
  const token = config.botToken;
  const prisma = new PrismaClient();
  const deps = prismaDiscordDeps(prisma);
  let registered = false;

  const gateway = new DiscordGateway(token, {
    onReady: ({ applicationId, user }) => {
      console.log(`[discord] connected as ${user} (application ${applicationId})`);
      if (registered) return;
      registered = true;
      registerCommands(token, config.applicationId ?? applicationId, COMMANDS)
        .then(() => console.log(`[discord] registered ${COMMANDS.length} slash commands`))
        .catch((err) => {
          registered = false;
          console.error("[discord] registering commands failed", err);
        });
    },
    onInteraction: (interaction) => {
      void handleInteraction(interaction, deps)
        .then((response) => respondToInteraction(interaction.id, interaction.token, response))
        .catch((err) => console.error("[discord] answering an interaction failed", err));
    },
    onFatal: (code) => {
      console.error(
        `[discord] the gateway refused the bot (close code ${code}). Check DISCORD_BOT_TOKEN in .env; the bot stays off until restarted.`
      );
      setInterval(() => {}, 24 * 60 * 60 * 1000);
    },
  });
  gateway.start();

  const shutdown = () => {
    gateway.stop();
    void prisma.$disconnect().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
