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

/**
 * "@user (tag)", with no id line.
 *
 * The id is NOT repeated here: base() already puts it in the footer, and a log
 * entry that states the same id twice reads as three times the information it
 * carries. Moderators still search by id, and the footer is where it stays.
 */
export function userLine(actor: Actor | null | undefined): string {
  if (!actor) return "Unknown user";
  const u = asUser(actor);
  return u.tag ? `<@${u.id}> (${u.tag})` : `<@${u.id}>`;
}

/**
 * Role ids as Discord role mentions.
 *
 * Discord renders these in the role's own colour, which is the single biggest
 * reason a Carl-style log scans faster than a code block: colour carries the
 * "which role" answer before you have finished reading the name. A diff block
 * cannot do that, and strips the role's identity down to plain grey text.
 *
 * Role mentions in an embed do NOT ping anyone, so this is safe even for a
 * mentionable role.
 */
export function roleMentions(ids: string[]): string {
  return clamp(ids.map((id) => `<@&${id}>`).join(" "));
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
    // Just the number. "User ID: " spends a third of the footer restating what
    // an 18-digit snowflake next to an avatar already obviously is.
    embed.setFooter({ text: u.id });
  }
  return embed;
}

/**
 * A subtle "by @mod" attribution line, or nothing when we do not know.
 *
 * Nothing, deliberately: "Unknown (no audit log access)" is a whole line that
 * tells the reader less than silence does, and it is the normal state for
 * anything self-serve or where the bot lacks ViewAuditLog. Callers append the
 * result and it disappears cleanly when empty.
 */
export function byLine(text: string | null, verb = "by"): string[] {
  return text ? [`-# ${verb} ${text}`] : [];
}

/**
 * A compact log entry: one line of description, no field grid.
 *
 * Fields are a table, and a table earns its cost when there are several values
 * to line up. Most log entries have exactly one fact ("this role was added"),
 * and rendering that as a two-column grid with headers is what makes a log wall
 * feel like a settings dump rather than a feed. Entries with genuinely several
 * values (a message edit, a before/after) still use fields.
 */
export function compact(
  title: string,
  color: number,
  actor: Actor | null | undefined,
  description: string,
): EmbedBuilder {
  return base(title, color, actor).setDescription(clamp(description, 4096));
}

// ---------------- Messages ----------------

export function messageDeleteEmbed(
  message: Message | PartialMessage,
  executor: string | null,
): EmbedBuilder {
  // Who and where read as a sentence rather than a two-column table: a delete
  // has one fact worth a heading (the content), and burying it under a grid of
  // labels is what made these entries several times the size of the message.
  const embed = compact(
    "🗑️ Message deleted",
    LOG_COLORS.destroy,
    message.author,
    [
      `${userLine(message.author)} in <#${message.channelId}>`,
      ...byLine(executor, "deleted by"),
    ].join("\n"),
  ).addFields({ name: "Content", value: bodyOf(message) });

  const files = attachmentList(message.attachments);
  if (files) {
    // The CDN links die with the message, but the filenames still tell the
    // moderator what was posted, which is usually the question being asked.
    embed.addFields({ name: "Attachments", value: files });
  }

  // Message id in the footer rather than a field: it is a lookup key, not
  // something anyone reads, and base() already put the author id there.
  if (message.id) {
    embed.setFooter({
      text: message.author
        ? `User ${message.author.id} · Message ${message.id}`
        : `Message ${message.id}`,
    });
  }

  return embed;
}

export function messageEditEmbed(
  before: Message | PartialMessage,
  after: Message | PartialMessage,
): EmbedBuilder {
  // Before/after keeps its fields: two bodies to compare is exactly what a
  // field grid is for. The who/where/jump row above them is not.
  const embed = compact(
    "✏️ Message edited",
    LOG_COLORS.update,
    after.author,
    [
      `${userLine(after.author)} in <#${after.channelId}>`,
      ...(after.url ? [`-# [jump to message](${after.url})`] : []),
    ].join("\n"),
  ).addFields(
    { name: "Before", value: bodyOf(before) },
    { name: "After", value: bodyOf(after) },
  );

  if (after.id) {
    embed.setFooter({
      text: after.author
        ? `User ${after.author.id} · Message ${after.id}`
        : `Message ${after.id}`,
    });
  }

  return embed;
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
