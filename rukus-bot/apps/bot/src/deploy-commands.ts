import { REST, Routes } from "discord.js";
import { env } from "./env.js";
import { log } from "./lib/logger.js";
import { Collection } from "discord.js";
import { loadCommands } from "./lib/loaders.js";
import type { BotClient } from "./lib/types.js";

/**
 * Registers slash commands with Discord:  pnpm bot:deploy-commands
 *
 * Globally, because the bot is public and global is the only scope that reaches
 * servers we have never seen. Global registration can take up to an hour to
 * propagate, so when DISCORD_GUILD_ID is set we also register to that guild,
 * where it is instant. Discord prefers the guild copy, so there is no duplicate.
 *
 * The bot also does this on every boot (see events/ready.ts); this script is for
 * pushing a command change without a redeploy.
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

  log.info(`Deploying ${body.length} command(s) globally…`);
  const data = (await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
    body,
  })) as unknown[];
  log.info(
    `Registered ${data.length} command(s) globally. New servers may take up to an hour to see them.`,
  );

  if (env.DISCORD_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
      { body },
    );
    log.info(`Also registered to home guild ${env.DISCORD_GUILD_ID} (instant).`);
  }
}

main().catch((err) => {
  log.error("Command deployment failed:", err);
  process.exit(1);
});
