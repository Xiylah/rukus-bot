import { Events, Routes, type Client } from "discord.js";
import { env } from "../env.js";
import type { BotClient, EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import { startAutoCloseSweeper } from "../features/tickets/autoclose.js";
import { startGiveawaySweeper } from "../features/giveaways/sweeper.js";
import { startReminderSweeper } from "../features/reminders/sweeper.js";
import { startRoleSweeper } from "../features/roles/sweeper.js";

/**
 * On startup: log in, then register slash + context-menu commands with Discord.
 *
 * Registration is idempotent (a PUT that replaces the guild's command set), so
 * running it on every boot is safe and means a Railway deploy is all you need -
 * no separate `deploy-commands` step to remember. Set SKIP_COMMAND_SYNC=1 to
 * opt out (e.g. to avoid the extra API call on frequent restarts).
 */
const handler: EventHandler<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  execute: async (client: Client) => {
    log.info(`Logged in as ${client.user?.tag} (id: ${client.user?.id}).`);
    log.info(`Serving ${client.guilds.cache.size} guild(s).`);
    client.user?.setActivity("Discord API");
    startAutoCloseSweeper(client);
    startGiveawaySweeper(client);
    startReminderSweeper(client);
    startRoleSweeper(client);

    if (process.env.SKIP_COMMAND_SYNC === "1") {
      log.info("SKIP_COMMAND_SYNC=1 - not registering commands.");
      return;
    }

    try {
      const bot = client as BotClient;
      const body = [
        ...[...bot.commands.values()].map((c) => c.data.toJSON()),
        ...[...bot.contextCommands.values()].map((c) => c.data.toJSON()),
      ];
      await client.rest.put(
        Routes.applicationGuildCommands(
          env.DISCORD_CLIENT_ID,
          env.DISCORD_GUILD_ID,
        ),
        { body },
      );
      log.info(`Registered ${body.length} command(s) to guild ${env.DISCORD_GUILD_ID}.`);
    } catch (err) {
      // Don't take the bot down over this - it still works for buttons/menus,
      // and the operator can run `pnpm bot:deploy-commands` manually.
      log.error("Command registration failed (bot still running):", err);
    }
  },
};

export default handler;
