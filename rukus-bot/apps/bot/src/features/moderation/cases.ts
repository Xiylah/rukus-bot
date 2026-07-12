import { EmbedBuilder, type Guild, type User } from "discord.js";
import { prisma, type CaseAction } from "@rukus/db";
import { COLORS } from "@rukus/shared";
import { moderationConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";

/**
 * Moderation case system: every action (/warn, /timeout, /kick, /ban, ...)
 * becomes a numbered case, forming a per-user record that /history and the
 * dashboard can browse.
 */

const ACTION_STYLE: Record<CaseAction, { emoji: string; color: number; verb: string }> = {
  WARN: { emoji: "⚠️", color: COLORS.warning, verb: "warned" },
  TIMEOUT: { emoji: "🔇", color: COLORS.warning, verb: "timed out" },
  UNTIMEOUT: { emoji: "🔊", color: COLORS.success, verb: "un-timed out" },
  KICK: { emoji: "👢", color: COLORS.danger, verb: "kicked" },
  BAN: { emoji: "🔨", color: COLORS.danger, verb: "banned" },
  UNBAN: { emoji: "🕊️", color: COLORS.success, verb: "unbanned" },
};

/** Reserve the next sequential case number for a guild, atomically. */
async function nextCaseNumber(guildId: string): Promise<number> {
  const row = await prisma.caseCounter.upsert({
    where: { guildId },
    create: { guildId, next: 2 },
    update: { next: { increment: 1 } },
  });
  return row.next - 1;
}

export interface NewCase {
  guild: Guild;
  action: CaseAction;
  target: User;
  moderatorId: string;
  reason?: string;
  durationMin?: number;
}

/**
 * Record a case, DM the target, and post to the mod-log channel.
 * Returns the case number. DM/log failures never block the action itself.
 */
export async function createCase(params: NewCase): Promise<number> {
  const { guild, action, target, moderatorId, reason, durationMin } = params;
  const number = await nextCaseNumber(guild.id);

  await prisma.modCase.create({
    data: {
      guildId: guild.id,
      number,
      action,
      userId: target.id,
      userTag: target.tag,
      moderatorId,
      reason: reason ?? null,
      durationMin: durationMin ?? null,
    },
  });

  const style = ACTION_STYLE[action];
  const durationText = durationMin ? ` for ${formatMinutes(durationMin)}` : "";

  // DM the member (best effort; closed DMs are normal).
  await target
    .send(
      `${style.emoji} You were ${style.verb}${durationText} in **${guild.name}**.` +
        (reason ? `\nReason: ${reason}` : "") +
        `\nCase #${String(number).padStart(4, "0")}`,
    )
    .catch(() => {});

  // Mod-log embed.
  try {
    const mod = await moderationConfig(guild.id);
    if (mod.logChannelId) {
      const channel = guild.channels.cache.get(mod.logChannelId);
      if (channel?.isSendable()) {
        const embed = new EmbedBuilder()
          .setColor(style.color)
          .setTitle(`${style.emoji} ${action} | Case #${String(number).padStart(4, "0")}`)
          .addFields(
            { name: "Member", value: `<@${target.id}> (${target.tag})`, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            ...(durationMin
              ? [{ name: "Duration", value: formatMinutes(durationMin), inline: true }]
              : []),
            { name: "Reason", value: reason || "No reason provided" },
          )
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      }
    }
  } catch (err) {
    log.warn(`Case log post failed: ${String(err)}`);
  }

  return number;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

/** A user's most recent cases plus per-action counts. */
export async function userHistory(guildId: string, userId: string) {
  const [cases, counts] = await Promise.all([
    prisma.modCase.findMany({
      where: { guildId, userId },
      orderBy: { number: "desc" },
      take: 10,
    }),
    prisma.modCase.groupBy({
      by: ["action"],
      where: { guildId, userId },
      _count: true,
    }),
  ]);
  return { cases, counts };
}

export function getCase(guildId: string, number: number) {
  return prisma.modCase.findUnique({
    where: { guildId_number: { guildId, number } },
  });
}

export function deleteCase(guildId: string, number: number) {
  return prisma.modCase.delete({
    where: { guildId_number: { guildId, number } },
  });
}

export { ACTION_STYLE };
