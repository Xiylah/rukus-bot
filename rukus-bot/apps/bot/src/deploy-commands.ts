import { REST, Routes } from "discord.js";
import { env } from "./env.js";
import { log } from "./lib/logger.js";
import { Collection } from "discord.js";
import { loadCommands } from "./lib/loaders.js";
import type { BotClient } from "./lib/types.js";

/**
 * Registers slash commands to the configured guild (instant, unlike global
 * commands which can take up to an hour to propagate). Run this whenever you
 * add or change a command's definition:  pnpm bot:deploy-commands
 */
async function main() {
  // We only need the command registries, so stub a minimal client shape.
  const stub = {
    commands: new Collection(),
    contextCommands: new Collection(),
  } as unknown as BotClient;
  const commands = await loadCommands(stub);
  const body = commands.map((c) => c.data.toJSON());

  const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);

  log.info(`Deploying ${body.length} command(s) to guild ${env.DISCORD_GUILD_ID}…`);
  const data = (await rest.put(
    Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
    { body },
  )) as unknown[];
  log.info(`Successfully registered ${data.length} command(s).`);
}

main().catch((err) => {
  log.error("Command deployment failed:", err);
  process.exit(1);
});
