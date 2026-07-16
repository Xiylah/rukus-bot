import { EmbedBuilder, type Guild } from "discord.js";
import { prisma } from "@rukus/db";
import { COLORS, type ModerationConfig } from "@rukus/shared";
import { log } from "../../lib/logger.js";
import { createCase, formatMinutes } from "./cases.js";

/**
 * Warn-escalation ladder: once a member's ACTIVE warn count reaches a rung in
 * config.warnEscalation, the bot applies that rung's punishment on its own.
 *
 * "Active" respects config.warnExpiryDays: a warn older than that stops counting
 * (a server that ramps down over time doesn't want a year-old warn dragging
 * someone to a ban). warnExpiryDays === 0 means warns never expire.
 *
 * This is called AFTER /warn has already recorded its own WARN case, so the
 * fresh warn is included in the count. It never rewrites createCase; the
 * escalation action becomes its own case (which carries the DM + mod-log).
 */

/**
 * Count a member's warns that still count toward escalation.
 * Exported so /history and /case can mark expired warns the same way.
 */
export function warnCutoff(expiryDays: number): Date | null {
  if (expiryDays <= 0) return null;
  return new Date(Date.now() - expiryDays * 86_400_000);
}

async function activeWarnCount(
  guildId: string,
  userId: string,
  expiryDays: number,
): Promise<number> {
  const cutoff = warnCutoff(expiryDays);
  return prisma.modCase.count({
    where: {
      guildId,
      userId,
      action: "WARN",
      ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
    },
  });
}

/** Best-effort mod-log note used when the bot cannot carry out an escalation. */
async function logNote(
  guild: Guild,
  config: ModerationConfig,
  text: string,
): Promise<void> {
  try {
    if (!config.logChannelId) return;
    const channel = guild.channels.cache.get(config.logChannelId);
    if (!channel?.isSendable()) return;
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle("⚠️ Warn escalation skipped")
          .setDescription(text)
          .setTimestamp(),
      ],
    });
  } catch (err) {
    log.warn(`Escalation note post failed: ${String(err)}`);
  }
}

/**
 * Evaluate the ladder for a member and apply the highest rung they have reached.
 * Returns a short human string describing what happened, or null when no rung
 * applied. Failures (hierarchy, missing member) post a mod-log note rather than
 * throwing: /warn must still succeed even when the auto-punish can't.
 */
export async function escalateIfNeeded(
  guild: Guild,
  targetId: string,
  config: ModerationConfig,
): Promise<string | null> {
  if (config.warnEscalation.length === 0) return null;

  const count = await activeWarnCount(guild.id, targetId, config.warnExpiryDays);

  // Highest rung whose threshold the member has now reached. Sorting ascending
  // and scanning for the last match gives "ban at 7" priority over "kick at 5".
  const rungs = [...config.warnEscalation].sort((a, b) => a.warns - b.warns);
  let rung: (typeof rungs)[number] | null = null;
  for (const r of rungs) {
    if (count >= r.warns) rung = r;
  }
  if (!rung) return null;

  const target = await guild.client.users.fetch(targetId).catch(() => null);
  if (!target) {
    await logNote(
      guild,
      config,
      `Could not fetch <@${targetId}> to apply the ${rung.action} rung at ${count} warnings.`,
    );
    return null;
  }
  const member = await guild.members.fetch(targetId).catch(() => null);
  const reason = `Auto: reached ${count} warnings`;

  try {
    if (rung.action === "timeout") {
      // A member who has left the guild cannot be timed out; nothing to do.
      if (!member) {
        await logNote(
          guild,
          config,
          `<@${targetId}> reached ${count} warnings but is not in the server, so the timeout rung was skipped.`,
        );
        return null;
      }
      if (!member.moderatable) {
        await logNote(
          guild,
          config,
          `<@${targetId}> reached ${count} warnings but I can't time them out (their highest role is above mine). Handle it manually.`,
        );
        return null;
      }
      const minutes = rung.durationMin > 0 ? rung.durationMin : 60;
      await member.timeout(minutes * 60_000, reason);
      await createCase({
        guild,
        action: "TIMEOUT",
        target,
        moderatorId: guild.client.user.id,
        reason,
        durationMin: minutes,
      });
      return `timed out for ${formatMinutes(minutes)}`;
    }

    if (rung.action === "kick") {
      if (!member) {
        await logNote(
          guild,
          config,
          `<@${targetId}> reached ${count} warnings but is not in the server, so the kick rung was skipped.`,
        );
        return null;
      }
      if (!member.kickable) {
        await logNote(
          guild,
          config,
          `<@${targetId}> reached ${count} warnings but I can't kick them (their highest role is above mine). Handle it manually.`,
        );
        return null;
      }
      // Record + DM BEFORE the kick, or the DM can no longer be delivered.
      await createCase({
        guild,
        action: "KICK",
        target,
        moderatorId: guild.client.user.id,
        reason,
      });
      await member.kick(reason);
      return "kicked";
    }

    // ban: works even if the member has already left (guild-level action), but
    // if they are present we still respect the hierarchy flag.
    if (member && !member.bannable) {
      await logNote(
        guild,
        config,
        `<@${targetId}> reached ${count} warnings but I can't ban them (their highest role is above mine). Handle it manually.`,
      );
      return null;
    }
    await createCase({
      guild,
      action: "BAN",
      target,
      moderatorId: guild.client.user.id,
      reason,
    });
    await guild.members.ban(targetId, { reason });
    return "banned";
  } catch (err) {
    log.warn(`Warn escalation failed: ${String(err)}`);
    await logNote(
      guild,
      config,
      `<@${targetId}> reached ${count} warnings but the ${rung.action} rung failed to apply. Handle it manually.`,
    );
    return null;
  }
}
