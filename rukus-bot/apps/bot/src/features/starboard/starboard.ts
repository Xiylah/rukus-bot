import {
  EmbedBuilder,
  type Guild,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type TextChannel,
  type User,
} from "discord.js";
import { prisma } from "@rukus/db";
import type { StarboardConfig } from "@rukus/shared";
import { starboardConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";

/**
 * Starboard: a message the server reacts to enough times gets mirrored into a
 * highlights channel.
 *
 * Add and remove funnel into ONE recount path rather than incrementing a
 * counter, because reactions arrive out of order and can be removed in bulk;
 * re-reading the true count off the message is the only thing that stays
 * correct. The count Discord gives us includes stars we must not honour (the
 * author's own, bots'), so we fetch the reactors and filter.
 *
 * The event files call handleStarReaction(); everything else here is internal.
 */

/**
 * True if the reaction is the guild's star emoji. Config holds a unicode emoji,
 * a raw <:name:id> mention (what you get from pasting a custom emoji into
 * Discord and prefixing a backslash), or a bare emoji id.
 */
export function isStarEmoji(
  reaction: MessageReaction | PartialMessageReaction,
  configured: string,
): boolean {
  const want = configured.trim();
  const custom = /<a?:([^:]+):(\d{17,20})>/.exec(want);
  if (custom) return reaction.emoji.id === custom[2];
  if (/^\d{17,20}$/.test(want)) return reaction.emoji.id === want;
  return reaction.emoji.name === want;
}

/** How the star emoji should be rendered back into an embed/message. */
function renderEmoji(configured: string): string {
  const want = configured.trim();
  if (/^\d{17,20}$/.test(want)) return `<:star:${want}>`;
  return want;
}

/** The first image attachment or embed image on a message, if any. */
export function firstImageUrl(message: Message): string | null {
  const attachment = message.attachments.find((a) =>
    (a.contentType ?? "").startsWith("image/"),
  );
  if (attachment) return attachment.url;
  const embedded = message.embeds.find((e) => e.image?.url ?? e.thumbnail?.url);
  return embedded?.image?.url ?? embedded?.thumbnail?.url ?? null;
}

/** Would this message ever be eligible, ignoring the star count? */
export function isStarrable(
  message: Message,
  config: StarboardConfig,
): boolean {
  if (message.author.bot) return false;
  if (config.ignoreChannelIds.includes(message.channelId)) return false;
  // Threads inherit the parent's ignore rule: staff expect "ignore #spam" to
  // cover the threads hanging off it, not just top-level messages.
  const parentId = message.channel.isThread() ? message.channel.parentId : null;
  if (parentId && config.ignoreChannelIds.includes(parentId)) return false;
  if (!config.allowNsfw && "nsfw" in message.channel && message.channel.nsfw) {
    return false;
  }
  const roles = message.member?.roles.cache;
  if (roles && config.ignoreRoleIds.some((id) => roles.has(id))) return false;
  // The starboard channel itself, or a message we posted there, must never be
  // re-starred into a loop.
  if (message.channelId === config.channelId) return false;
  return true;
}

/** Count the honoured stars on a message: humans only, author only if allowed. */
async function countStars(
  reaction: MessageReaction,
  message: Message,
  config: StarboardConfig,
): Promise<number> {
  const users = await reaction.users.fetch().catch(() => null);
  if (!users) return 0;
  return users.filter(
    (u) => !u.bot && (config.allowSelfStar || u.id !== message.author.id),
  ).size;
}

function starboardEmbed(
  message: Message,
  config: StarboardConfig,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(config.embedColor.slice(1), 16))
    .setAuthor({
      name: message.author.displayName || message.author.username,
      iconURL: message.author.displayAvatarURL(),
    })
    .setTimestamp(message.createdAt)
    .setFooter({ text: `#${(message.channel as TextChannel).name ?? "unknown"}` });

  if (message.content) embed.setDescription(message.content.slice(0, 4000));

  const image = firstImageUrl(message);
  if (image) embed.setImage(image);

  if (config.showJumpLink) {
    embed.addFields({
      name: "​",
      value: `[Jump to message](${message.url})`,
    });
  }

  return embed;
}

/** The one-line header above the embed, carrying the live star count. */
function starLine(config: StarboardConfig, count: number, channelId: string): string {
  return `${renderEmoji(config.emoji)} **${count}** • <#${channelId}>`;
}

async function resolveStarboardChannel(
  guild: Guild,
  config: StarboardConfig,
): Promise<TextChannel | null> {
  if (!config.channelId) return null;
  const channel =
    guild.channels.cache.get(config.channelId) ??
    (await guild.channels.fetch(config.channelId).catch(() => null));
  if (!channel?.isTextBased()) return null;
  return channel as TextChannel;
}

/**
 * The whole starboard reaction path. Called from both messageReactionAdd and
 * messageReactionRemove; the logic is identical because we always recount.
 */
export async function handleStarReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (user.bot) return;

  let full: MessageReaction;
  if (reaction.partial) {
    const fetched = await reaction.fetch().catch(() => null);
    if (!fetched) return;
    full = fetched;
  } else {
    full = reaction;
  }

  const guildId = full.message.guildId;
  if (!guildId) return;

  const config = await starboardConfig(guildId);
  if (!config.enabled || !config.channelId) return;
  if (!isStarEmoji(full, config.emoji)) return;

  const message = full.message.partial
    ? await full.message.fetch().catch(() => null)
    : (full.message as Message);
  if (!message || !message.guild) return;
  if (!isStarrable(message, config)) return;

  try {
    const count = await countStars(full, message, config);
    const existing = await prisma.starboardPost.findUnique({
      where: { sourceMessageId: message.id },
    });

    const board = await resolveStarboardChannel(message.guild, config);
    if (!board) return;

    if (count >= config.threshold) {
      if (existing) {
        // Already on the board: just refresh the count in place.
        if (existing.starCount === count) return;
        const posted = await board.messages
          .fetch(existing.starboardMessageId)
          .catch(() => null);
        if (!posted) {
          // Someone deleted the board post. Drop the row so the next star
          // re-posts it instead of editing a message that no longer exists.
          await prisma.starboardPost.delete({
            where: { sourceMessageId: message.id },
          });
          return;
        }
        await posted.edit({
          content: starLine(config, count, message.channelId),
          embeds: [starboardEmbed(message, config)],
        });
        await prisma.starboardPost.update({
          where: { sourceMessageId: message.id },
          data: { starCount: count },
        });
        return;
      }

      const posted = await board.send({
        content: starLine(config, count, message.channelId),
        embeds: [starboardEmbed(message, config)],
      });
      await prisma.starboardPost.create({
        data: {
          guildId,
          sourceMessageId: message.id,
          sourceChannelId: message.channelId,
          starboardMessageId: posted.id,
          authorId: message.author.id,
          starCount: count,
        },
      });
      return;
    }

    // Below threshold. If it was on the board, it no longer belongs there.
    if (existing) {
      await board.messages
        .fetch(existing.starboardMessageId)
        .then((m) => m.delete())
        .catch(() => {});
      await prisma.starboardPost.delete({
        where: { sourceMessageId: message.id },
      });
    }
  } catch (err) {
    log.error(`Starboard failed for message ${message.id}:`, err);
  }
}
