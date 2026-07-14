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
      // Without these four the logging handlers below load fine and then never
      // fire: Discord simply doesn't send the events to a gateway that hasn't
      // asked for them.
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildExpressions,
    ],
    // GuildMember: a leave/ban for a member we never cached still has to resolve
    // to a user, or the join/leave log silently drops it.
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.Reaction,
      Partials.GuildMember,
    ],
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
