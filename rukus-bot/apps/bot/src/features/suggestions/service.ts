import { EmbedBuilder, type Guild, type TextChannel } from "discord.js";
import { prisma, type Suggestion, type SuggestionStatus } from "@rukus/db";
import { COLORS } from "@rukus/shared";
import type { SuggestionsConfig } from "@rukus/shared";

/**
 * Suggestion domain operations: numbering, posting, and re-rendering the embed
 * when staff make a decision. Command handlers call these and only deal with
 * replying to the user.
 */

/** Reserve the next sequential suggestion number for a guild, atomically. */
export async function nextSuggestionNumber(guildId: string): Promise<number> {
  // Same upsert-then-increment shape as tickets: two /suggest calls landing at
  // once must not be handed the same number, which the unique index would
  // reject anyway.
  return prisma.$transaction(async (tx) => {
    const row = await tx.suggestionCounter.upsert({
      where: { guildId },
      create: { guildId, next: 2 },
      update: { next: { increment: 1 } },
    });
    // On create we set next=2 and hand out 1; on update we handed out (next-1).
    return row.next - 1;
  });
}

const STATUS_META: Record<
  SuggestionStatus,
  { label: string; color: number; emoji: string }
> = {
  PENDING: { label: "Pending", color: COLORS.neutral, emoji: "🗳️" },
  APPROVED: { label: "Approved", color: COLORS.success, emoji: "✅" },
  DENIED: { label: "Denied", color: COLORS.danger, emoji: "❌" },
  CONSIDERED: { label: "Under consideration", color: COLORS.warning, emoji: "🤔" },
  IMPLEMENTED: { label: "Implemented", color: COLORS.primary, emoji: "🚀" },
};

export function statusMeta(status: SuggestionStatus) {
  return STATUS_META[status];
}

/** The suggestion card. Same builder for the initial post and every edit. */
export function suggestionEmbed(
  suggestion: Pick<
    Suggestion,
    "number" | "text" | "authorId" | "status" | "reason" | "staffId"
  >,
  config: SuggestionsConfig,
  author: { name: string; iconURL: string } | null,
): EmbedBuilder {
  const meta = STATUS_META[suggestion.status];
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Suggestion #${suggestion.number}`)
    .setDescription(suggestion.text)
    .addFields({ name: "Status", value: meta.label, inline: true });

  // Anonymous hides the author from the card, not from the database: staff
  // still need to be able to act on abuse, so authorId is always stored.
  if (!config.anonymous && author) {
    embed.setAuthor({ name: author.name, iconURL: author.iconURL });
  } else if (config.anonymous) {
    embed.setFooter({ text: "Submitted anonymously" });
  }

  if (suggestion.reason && suggestion.staffId) {
    embed.addFields({
      name: `${meta.label} by`,
      value: `<@${suggestion.staffId}>`,
      inline: true,
    });
    embed.addFields({ name: "Reason", value: suggestion.reason });
  } else if (suggestion.staffId) {
    embed.addFields({
      name: `${meta.label} by`,
      value: `<@${suggestion.staffId}>`,
      inline: true,
    });
  }

  return embed;
}

export function getSuggestion(guildId: string, number: number) {
  return prisma.suggestion.findUnique({
    where: { guildId_number: { guildId, number } },
  });
}

/**
 * Rewrite the original suggestion message to match its new status. Returns
 * false if the message is gone, so the caller can tell staff the decision was
 * recorded but the card could not be updated.
 */
export async function refreshSuggestionMessage(
  guild: Guild,
  suggestion: Suggestion,
  config: SuggestionsConfig,
): Promise<boolean> {
  const channel =
    guild.channels.cache.get(suggestion.channelId) ??
    (await guild.channels.fetch(suggestion.channelId).catch(() => null));
  if (!channel?.isTextBased()) return false;

  const message = await (channel as TextChannel).messages
    .fetch(suggestion.messageId)
    .catch(() => null);
  if (!message) return false;

  const author = await guild.client.users
    .fetch(suggestion.authorId)
    .catch(() => null);

  await message.edit({
    embeds: [
      suggestionEmbed(
        suggestion,
        config,
        author
          ? {
              name: author.displayName || author.username,
              iconURL: author.displayAvatarURL(),
            }
          : null,
      ),
    ],
  });
  return true;
}
