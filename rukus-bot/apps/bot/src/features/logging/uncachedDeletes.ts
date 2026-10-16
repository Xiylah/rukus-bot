import type { EmbedBuilder, Guild } from "discord.js";
import { LOG_COLORS, emit } from "./dispatch.js";
import { compact } from "./embeds.js";
import { log } from "../../lib/logger.js";

/**
 * Batches deletions of messages the bot never saw.
 *
 * A message posted before the bot's current session is not in its cache, so
 * when it is deleted Discord sends only an id: no author, no text. Logging each
 * one produced a wall of "Unknown user / Not cached" entries whenever someone
 * cleared out old messages (a member running a self-delete script, or a mod
 * tool purging a user's history), each carrying no information at all.
 *
 * Instead these are collected per guild and flushed as ONE summary: how many,
 * which channels, and when they were originally posted (recoverable from the
 * message id itself). Deletions of messages the bot DID see are unaffected and
 * still log individually with their content.
 */

/** Flush once the deletions go quiet for this long... */
const QUIET_MS = 8_000;
/** ...or after this long regardless, so a long purge still reports promptly. */
const MAX_WAIT_MS = 60_000;

interface Batch {
  guild: Guild;
  /** channelId -> how many deleted there. */
  channels: Map<string, number>;
  ids: string[];
  firstAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const batches = new Map<string, Batch>();

/** Where summaries go. Swappable so tests can capture them instead of posting. */
let sink = (guild: Guild, embed: EmbedBuilder) => emit(guild, "messageDelete", embed);
export function setUncachedDeleteSinkForTests(fn: typeof sink): void {
  sink = fn;
}

/** When a message was posted, from its snowflake id. */
function postedAt(id: string): number {
  return Number(BigInt(id) >> 22n) + 1_420_070_400_000;
}

function day(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:d>`;
}

async function flush(guildId: string): Promise<void> {
  const batch = batches.get(guildId);
  if (!batch) return;
  batches.delete(guildId);
  clearTimeout(batch.timer);

  const count = batch.ids.length;
  const times = batch.ids.map(postedAt);
  const oldest = Math.min(...times);
  const newest = Math.max(...times);
  const when = day(oldest) === day(newest) ? day(oldest) : `${day(oldest)} to ${day(newest)}`;

  const channelLines = [...batch.channels.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `<#${id}>: **${n}**`);

  const lines = [
    `**${count}** older message${count === 1 ? "" : "s"} deleted`,
    `Originally posted ${when}`,
    "",
    ...channelLines.slice(0, 15),
    ...(channelLines.length > 15 ? [`...and ${channelLines.length - 15} more channel(s)`] : []),
    "",
    "-# Posted before the bot's last restart, so Discord did not send the author or text.",
  ];

  const embed = compact(
    count === 1 ? "🗑️ Message deleted" : "🗑️ Messages deleted",
    LOG_COLORS.destroy,
    null,
    lines.join("\n"),
  ).setFooter({
    text: count === 1 ? `Message ${batch.ids[0]}` : `${count} messages`,
  });

  await Promise.resolve(sink(batch.guild, embed)).catch((err) =>
    log.warn(`Uncached delete summary failed in ${guildId}: ${String(err)}`),
  );
}

/** Queue one uncached deletion for the guild's next summary. */
export function queueUncachedDelete(guild: Guild, channelId: string, messageId: string): void {
  let batch = batches.get(guild.id);
  if (batch) {
    clearTimeout(batch.timer);
  } else {
    batch = { guild, channels: new Map(), ids: [], firstAt: Date.now(), timer: undefined as never };
    batches.set(guild.id, batch);
  }

  batch.channels.set(channelId, (batch.channels.get(channelId) ?? 0) + 1);
  batch.ids.push(messageId);

  // Wait for a quiet gap, but never past MAX_WAIT_MS from the first deletion.
  const remaining = MAX_WAIT_MS - (Date.now() - batch.firstAt);
  batch.timer = setTimeout(() => void flush(guild.id), Math.max(0, Math.min(QUIET_MS, remaining)));
}
