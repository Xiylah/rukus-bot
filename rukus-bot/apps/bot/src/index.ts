import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import { env } from "./env.js";
import { log } from "./lib/logger.js";
import { loadCommands, loadEvents } from "./lib/loaders.js";
import type { BotClient } from "./lib/types.js";

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
  }) as BotClient;

  client.commands = new Collection();
  client.contextCommands = new Collection();

  await loadCommands(client);
  await loadEvents(client);

  // Surface unhandled rejections instead of dying silently.
  process.on("unhandledRejection", (reason) =>
    log.error("Unhandled promise rejection:", reason),
  );

  await client.login(env.DISCORD_BOT_TOKEN);
}

main().catch((err) => {
  log.error("Fatal startup error:", err);
  process.exit(1);
});
