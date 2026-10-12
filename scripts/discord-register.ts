/**
 * Registers the Discord bot's slash commands (S26): `npm run discord:register`.
 * The gateway bot (`npm run worker:discord`) does this on every start; this
 * script is for a deployment that answers commands only over HTTP
 * (/api/discord/interactions) and runs no gateway bot.
 */
import { COMMANDS } from "@/lib/discord/commands";
import { discordConfig, fetchApplicationId, registerCommands } from "@/lib/discord/rest";

async function main() {
  const { botToken, applicationId } = discordConfig();
  if (!botToken) {
    console.error("DISCORD_BOT_TOKEN is not set (see docs/TESTOWANIE.md, Discord).");
    process.exit(1);
  }
  const appId = applicationId ?? (await fetchApplicationId(botToken));
  await registerCommands(botToken, appId, COMMANDS);
  console.log(`Registered ${COMMANDS.length} commands for application ${appId}: ${COMMANDS.map((c) => `/${c.name}`).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
