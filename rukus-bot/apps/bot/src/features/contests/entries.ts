import type { Message } from "discord.js";
import { prisma } from "@rukus/db";
import { contestsConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import { activeContestFor, hasMedia, mediaUrl } from "./service.js";

/**
 * Turn a member's image/video post into a contest entry.
 *
 * Called from messageCreate. Swallows its own errors: a contest is a nicety and
 * must never interfere with the rest of the message pipeline.
 *
 * Returns true when the message was consumed as an entry (or deleted for not
 * being media), so the caller can stop processing it.
 */
export async function runContestEntry(message: Message): Promise<boolean> {
  if (!message.inGuild() || message.author.bot) return false;

  try {
    const config = await contestsConfig(message.guildId);
    if (!config.enabled) return false;

    const contest = await activeContestFor(message.guildId, message.channelId);
    if (!contest) return false;

    if (!hasMedia(message)) {
      // Chatter in the contest channel. Only remove it if the server asked for
      // a media-only channel; otherwise leave conversation alone.
      if (config.enforceMediaOnly) {
        await message.delete().catch(() => {});
        const warn = await message.channel
          .send({
            content: `${message.author} only images and videos can be posted here while **${contest.title}** is running.`,
          })
          .catch(() => null);
        if (warn) setTimeout(() => void warn.delete().catch(() => {}), 8_000);
        return true;
      }
      return false;
    }

    // Entry cap per member.
    if (config.maxEntriesPerUser > 0) {
      const mine = await prisma.contestEntry.count({
        where: { contestId: contest.id, userId: message.author.id },
      });
      if (mine >= config.maxEntriesPerUser) {
        const warn = await message.channel
          .send({
            content:
              `${message.author} you already have ${mine} entr${mine === 1 ? "y" : "ies"} in ` +
              `**${contest.title}** (max ${config.maxEntriesPerUser}). This post is not entered.`,
          })
          .catch(() => null);
        if (warn) setTimeout(() => void warn.delete().catch(() => {}), 10_000);
        return false;
      }
    }

    await prisma.contestEntry.create({
      data: {
        contestId: contest.id,
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        userId: message.author.id,
        mediaUrl: mediaUrl(message),
      },
    });

    // Pre-add the vote emoji so voting is one click and members do not need to
    // know which emoji counts.
    await message.react(config.voteEmoji).catch((e) => {
      log.warn(
        `Contest: could not add vote emoji "${config.voteEmoji}" in ${message.guildId}: ${String(e)}`,
      );
    });

    return true;
  } catch (err) {
    log.warn(`Contest entry handling failed: ${String(err)}`);
    return false;
  }
}
