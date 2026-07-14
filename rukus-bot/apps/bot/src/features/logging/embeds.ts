import {
  EmbedBuilder,
  type Attachment,
  type Collection,
  type Message,
  type PartialMessage,
} from "discord.js";
import { LOG_COLORS, type LogUser } from "./dispatch.js";

/** Anything with a `.user` (a member, partial or not) or a user in its own right. */
type Actor = LogUser | { user: LogUser };

/** Narrow an actor down to the user it describes. */
function asUser(actor: Actor): LogUser {
  return "user" in actor ? actor.user : actor;
}

/**
 * Embed construction for the log streams.
 *
 * Kept separate from dispatch so the shape of a log entry can change without
 * touching the routing, and so the partial-message handling lives in exactly
 * one place.
 */

/** Discord rejects embed field values over 1024 chars, so every body is clamped. */
const FIELD_MAX = 1024;

/** Truncate to fit an embed field, marking that we cut it. */
export function clamp(text: string, max = FIELD_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

/**
 * A message body as it should appear in a log.
 *
 * Uncached messages arrive as partials with `content === null`, which is not
 * the same as an empty message: we say so rather than showing a blank field,
 * because "the bot didn't have it" and "they posted nothing" are different
 * facts for a moderator reading the log.
 */
export function bodyOf(message: Message | PartialMessage): string {
  if (message.partial && !message.content) {
    return "*Not cached: the content is unavailable (the message predates the bot's current session).*";
  }
  const content = message.content?.trim();
  return content ? clamp(content) : "*No text content.*";
}

/** Attachments as a bullet list of links, or null when there are none. */
export function attachmentList(
  attachments: Collection<string, Attachment> | undefined,
): string | null {
  if (!attachments?.size) return null;
  const lines = attachments.map((a) => `[${a.name}](${a.url})`);
  return clamp(lines.join("\n"));
}

/** "@user (tag)" plus a raw id line, the form moderators actually search by. */
export function userLine(actor: Actor | null | undefined): string {
  if (!actor) return "Unknown user";
  const u = asUser(actor);
  return `<@${u.id}> (${u.tag ?? "unknown tag"})\n\`${u.id}\``;
}

/** Base embed with the timestamp and author block every log entry carries. */
export function base(
  title: string,
  color: number,
  actor?: Actor | null,
): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
  if (actor) {
    const u = asUser(actor);
    embed.setAuthor({ name: u.tag ?? u.id, iconURL: u.displayAvatarURL() });
    embed.setFooter({ text: `User ID: ${u.id}` });
  }
  return embed;
}

// ---------------- Messages ----------------

export function messageDeleteEmbed(
  message: Message | PartialMessage,
  executor: string | null,
): EmbedBuilder {
  const embed = base("🗑️ Message deleted", LOG_COLORS.destroy, message.author)
    .addFields(
      { name: "Author", value: userLine(message.author), inline: true },
      { name: "Channel", value: `<#${message.channelId}>`, inline: true },
      { name: "Content", value: bodyOf(message) },
    );

  const files = attachmentList(message.attachments);
  if (files) {
    // The CDN links die with the message, but the filenames still tell the
    // moderator what was posted, which is usually the question being asked.
    embed.addFields({ name: "Attachments", value: files });
  }
  if (executor) embed.addFields({ name: "Deleted by", value: executor, inline: true });

  return embed;
}

export function messageEditEmbed(
  before: Message | PartialMessage,
  after: Message | PartialMessage,
): EmbedBuilder {
  return base("✏️ Message edited", LOG_COLORS.update, after.author).addFields(
    { name: "Author", value: userLine(after.author), inline: true },
    { name: "Channel", value: `<#${after.channelId}>`, inline: true },
    {
      name: "Jump",
      value: after.url ? `[Go to message](${after.url})` : "Unavailable",
      inline: true,
    },
    { name: "Before", value: bodyOf(before) },
    { name: "After", value: bodyOf(after) },
  );
}

export function bulkDeleteEmbed(
  channelId: string,
  count: number,
  messages: (Message | PartialMessage)[],
  executor: string | null,
): EmbedBuilder {
  // A preview beats nothing: a mod purging 100 messages wants to know roughly
  // what was in them, and the full transcript would blow past the embed limit.
  const preview = messages
    .filter((m) => m.content)
    .slice(0, 10)
    .map((m) => `**${m.author?.tag ?? "unknown"}:** ${m.content?.slice(0, 80) ?? ""}`)
    .join("\n");

  const embed = base("🧹 Messages bulk-deleted", LOG_COLORS.destroy).addFields(
    { name: "Channel", value: `<#${channelId}>`, inline: true },
    { name: "Count", value: String(count), inline: true },
  );
  if (preview) embed.addFields({ name: "Sample (up to 10)", value: clamp(preview) });
  if (executor) embed.addFields({ name: "Deleted by", value: executor, inline: true });
  return embed;
}

// ---------------- Diffs ----------------

/**
 * Format a set-difference as green additions and red removals.
 * Discord has no per-line color in embeds, so a `diff` code block is the only
 * way to get red/green, and it is what every mainstream log bot uses.
 */
export function diffBlock(added: string[], removed: string[]): string {
  const lines = [
    ...added.map((a) => `+ ${a}`),
    ...removed.map((r) => `- ${r}`),
  ];
  return clamp(`\`\`\`diff\n${lines.join("\n")}\n\`\`\``);
}

/** A one-line "old -> new" for scalar field changes (nick, name, topic). */
export function changeLine(before: string | null, after: string | null): string {
  return clamp(`**Before:** ${before || "*none*"}\n**After:** ${after || "*none*"}`);
}
