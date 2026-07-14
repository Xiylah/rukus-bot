import { EmbedBuilder, Events, type Guild, type TextChannel } from "discord.js";
import { COLORS } from "@rukus/shared";
import { prisma } from "@rukus/db";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";

/**
 * The bot was added to a server.
 *
 * Two jobs, and only two:
 *
 * 1. Create the Guild row. Every FeatureConfig has a required relation to it,
 *    so without this the first dashboard save would fail on the foreign key.
 *    We do it here rather than lazily so the dashboard works the moment someone
 *    opens it.
 *
 * 2. Tell whoever added the bot where to configure it. A brand new install has
 *    every feature DISABLED (that is the schema default, and it is deliberate:
 *    a bot that starts moderating or replying the second it joins is a bot that
 *    gets removed). So without a pointer to the dashboard the bot just looks
 *    broken.
 *
 * Nothing here is allowed to throw: failing to send a greeting must not stop the
 * bot from serving the guild.
 */
const handler: EventHandler<Events.GuildCreate> = {
  name: Events.GuildCreate,
  execute: async (guild: Guild) => {
    log.info(`Joined guild ${guild.name} (${guild.id}), ${guild.memberCount} members.`);

    try {
      await prisma.guild.upsert({
        where: { id: guild.id },
        create: { id: guild.id, name: guild.name, iconHash: guild.icon },
        update: { name: guild.name, iconHash: guild.icon },
      });
    } catch (err) {
      log.error(`Could not create the guild row for ${guild.id}:`, err);
      // Keep going: the config writers upsert the guild too, so this is
      // recoverable. The greeting still helps them find the dashboard.
    }

    const dashboard = process.env.DASHBOARD_URL?.replace(/\/+$/, "");
    const link = dashboard ? `${dashboard}/dashboard/${guild.id}` : null;

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle("Thanks for adding me")
      .setDescription(
        "Everything starts switched **off**, so I will stay quiet until you " +
          "turn things on. Head to the dashboard to set me up.\n\n" +
          (link
            ? `**[Open the dashboard](${link})**`
            : "Ask the bot owner for the dashboard link.") +
          "\n\nRun `/help` to see everything I can do.",
      )
      .addFields({
        name: "Good places to start",
        value:
          "🎫 Tickets, 🎭 Reaction roles, 📜 Logging, 👋 Welcome messages",
      });

    // Prefer the owner's DMs (they added the bot, and it keeps the greeting out
    // of a public channel). Fall back to the first channel we can actually talk
    // in, since plenty of people have DMs closed.
    try {
      const owner = await guild.fetchOwner();
      await owner.send({ embeds: [embed] });
      return;
    } catch {
      /* DMs closed, or we cannot fetch the owner. Fall through. */
    }

    try {
      const channel = guild.channels.cache.find(
        (c): c is TextChannel =>
          c.isTextBased() &&
          c.isSendable() &&
          Boolean(guild.members.me && c.permissionsFor(guild.members.me)?.has("SendMessages")),
      );
      if (channel) await channel.send({ embeds: [embed] });
    } catch (err) {
      log.warn(`Could not greet guild ${guild.id}: ${String(err)}`);
    }
  },
};

export default handler;
