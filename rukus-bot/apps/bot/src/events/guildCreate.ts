import {
  AuditLogEvent,
  EmbedBuilder,
  Events,
  PermissionFlagsBits,
  type Guild,
  type TextChannel,
  type User,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import { prisma } from "@rukus/db";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import { primeGuild } from "../features/invites/cache.js";

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
/** How recent a "bot added" audit entry must be to describe THIS join. */
const INVITE_LOOKBACK_MS = 5 * 60_000;

/**
 * Who added the bot, or null when we cannot tell.
 *
 * Discord only records this in the audit log, readable only with View Audit
 * Log, which the invite deliberately does not request (a listing rule:
 * request only what you use). So this is best-effort and silent: no
 * permission, no entry, or any error means null and the caller falls back to
 * the owner. The entry must be recent and target this bot, so a server that
 * re-adds the bot never DMs whoever added it the first time, weeks ago.
 */
async function findInviter(guild: Guild): Promise<User | null> {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
    const entry = logs.entries.find(
      (e) =>
        e.targetId === guild.client.user.id &&
        Date.now() - e.createdTimestamp < INVITE_LOOKBACK_MS,
    );
    const executor = entry?.executor;
    if (!executor || executor.bot) return null;
    return executor.partial ? await executor.fetch() : executor;
  } catch {
    return null;
  }
}

const handler: EventHandler<Events.GuildCreate> = {
  name: Events.GuildCreate,
  execute: async (guild: Guild) => {
    log.info(`Joined guild ${guild.name} (${guild.id}), ${guild.memberCount} members.`);

    // Snapshot the guild's invites now, so the invite tracker has something to
    // diff against if a member joins before the next restart primes it.
    void primeGuild(guild);

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

    // DM whoever actually ADDED the bot, which is often an admin rather than the
    // owner. Discord only records that in the audit log, and reading it needs
    // View Audit Log, a permission the invite deliberately does not ask for. So
    // this is best-effort: when the bot can see it, the inviter gets the DM;
    // otherwise the owner does, then the first channel we can talk in, since
    // plenty of people have DMs closed. Keeps the greeting out of a public
    // channel whenever possible.
    const inviter = await findInviter(guild);
    if (inviter) {
      const sent = await inviter.send({ embeds: [embed] }).then(() => true).catch(() => false);
      if (sent) return;
    }

    try {
      const owner = await guild.fetchOwner();
      if (owner.id !== inviter?.id) {
        await owner.send({ embeds: [embed] });
        return;
      }
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
