import type { Message, GuildMember } from "discord.js";
import { prisma } from "@rukus/db";
import { formatDuration } from "@rukus/shared";
import { afkConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";

/**
 * AFK: mark yourself away, and let the people who ping you find out why without
 * anyone having to answer for you.
 *
 * Two things happen on every message:
 *   1. if the AUTHOR is AFK, they're clearly back, so clear it
 *   2. if the message MENTIONS anyone who is AFK, say so
 */

const AFK_PREFIX = "[AFK] ";

/** Add the marker to a nickname without ever exceeding Discord's 32-char cap. */
export function afkNickname(current: string): string {
  if (current.startsWith(AFK_PREFIX)) return current;
  return (AFK_PREFIX + current).slice(0, 32);
}

/** Remove the marker. Safe on a name that never had one. */
export function clearAfkNickname(current: string): string {
  return current.startsWith(AFK_PREFIX) ? current.slice(AFK_PREFIX.length) : current;
}

/** Set a member AFK. Returns false when the nickname could not be changed. */
export async function setAfk(
  member: GuildMember,
  message: string,
): Promise<{ nicknameChanged: boolean }> {
  await prisma.afk.upsert({
    where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
    create: { guildId: member.guild.id, userId: member.id, message },
    update: { message, since: new Date() },
  });

  // Renaming the owner or anyone above the bot is impossible, and that is fine:
  // the AFK itself still works, the nickname is only a courtesy.
  const changed = await member
    .setNickname(afkNickname(member.displayName), "AFK")
    .then(() => true)
    .catch(() => false);

  return { nicknameChanged: changed };
}

/** Clear a member's AFK and undo the nickname marker. */
async function clearAfk(member: GuildMember): Promise<void> {
  await prisma.afk.deleteMany({
    where: { guildId: member.guild.id, userId: member.id },
  });
  const restored = clearAfkNickname(member.displayName);
  if (restored !== member.displayName) {
    await member.setNickname(restored || null, "Back from AFK").catch(() => {});
  }
}

/**
 * Called from messageCreate. Returns true if the author was AFK and has just
 * been welcomed back (the caller does not need to do anything with that, it is
 * only there to make the behaviour testable/observable).
 */
export async function runAfk(message: Message): Promise<boolean> {
  if (!message.inGuild()) return false;

  const config = await afkConfig(message.guildId);
  if (!config.enabled) return false;

  try {
    // --- The author is back ---
    let cleared = false;
    const own = await prisma.afk.findUnique({
      where: { guildId_userId: { guildId: message.guildId, userId: message.author.id } },
    });
    if (own && message.member) {
      await clearAfk(message.member);
      cleared = true;
      const away = Math.round((Date.now() - own.since.getTime()) / 1000);
      if (message.channel.isSendable()) {
        await message.channel
          .send({
            content: `👋 Welcome back ${message.author}, you were away for ${formatDuration(away)}.`,
            allowedMentions: { users: [message.author.id] },
          })
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 15_000))
          .catch(() => {});
      }
    }

    // --- Somebody pinged an AFK member ---
    const mentioned = [...message.mentions.users.keys()].filter(
      (id) => id !== message.author.id,
    );
    if (mentioned.length > 0) {
      const rows = await prisma.afk.findMany({
        where: { guildId: message.guildId, userId: { in: mentioned } },
      });
      if (rows.length > 0 && message.channel.isSendable()) {
        const lines = rows.map((r) => {
          const away = Math.round((Date.now() - r.since.getTime()) / 1000);
          return `💤 <@${r.userId}> is AFK (${formatDuration(away)}): ${r.message}`;
        });
        await message
          .reply({
            content: lines.join("\n").slice(0, 2000),
            // Mentioning them would defeat the point: they are away.
            allowedMentions: { parse: [] },
          })
          .catch(() => {});
      }
    }

    return cleared;
  } catch (err) {
    log.warn(`AFK check failed: ${String(err)}`);
    return false;
  }
}
