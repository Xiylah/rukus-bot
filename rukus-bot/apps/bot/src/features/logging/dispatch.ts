import {
  AuditLogEvent,
  EmbedBuilder,
  type Guild,
  type GuildAuditLogsEntry,
} from "discord.js";
import { COLORS, type LoggingConfig } from "@rukus/shared";
import { loggingConfig } from "../../lib/configCache.js";
import { log as botLog } from "../../lib/logger.js";

/**
 * The single entry point every logging event goes through.
 *
 * Centralising the routing means an event handler never has to know which
 * channel it belongs in, whether the feature is on, or whether the actor is
 * ignored. It asks "should I log this?" and hands over an embed.
 */

/**
 * The only user shape logging ever needs.
 *
 * Deliberately structural, not `User`: message deletes, member leaves, and
 * audit entries all hand us PARTIAL users and members, which are not assignable
 * to discord.js's concrete classes. Every one of them still has an id, a tag,
 * and an avatar, and that is all a log line renders.
 */
export interface LogUser {
  id: string;
  /** Null on a partial user Discord never filled in. */
  tag: string | null;
  bot?: boolean;
  displayAvatarURL: () => string;
}

/** Every loggable event, mapped to the stream that carries it. */
export const EVENT_STREAM = {
  messageDelete: "message",
  messageEdit: "message",
  messageBulkDelete: "message",

  memberJoin: "join",
  memberLeave: "join",
  memberBan: "member",
  memberUnban: "member",
  memberKick: "member",
  memberRoleChange: "member",
  memberNickChange: "member",
  memberAvatarChange: "member",

  channelCreate: "server",
  channelDelete: "server",
  channelUpdate: "server",
  roleCreate: "server",
  roleDelete: "server",
  roleUpdate: "server",
  emojiUpdate: "server",
  serverUpdate: "server",
  inviteCreate: "server",
  inviteDelete: "server",

  voiceJoin: "voice",
  voiceLeave: "voice",
  voiceMove: "voice",
} as const satisfies Record<string, "message" | "member" | "server" | "voice" | "join">;

/** The name of a loggable event. Every key is also a boolean on the config. */
export type LogEvent = keyof typeof EVENT_STREAM;

/** Per-stream channel field on the config, keyed by stream name. */
const STREAM_CHANNEL = {
  message: "messageChannelId",
  member: "memberChannelId",
  server: "serverChannelId",
  voice: "voiceChannelId",
  join: "joinChannelId",
} as const;

/** Colors carry meaning at a glance: red destroyed, green created, yellow changed. */
export const LOG_COLORS = {
  create: COLORS.success,
  destroy: COLORS.danger,
  update: COLORS.warning,
  neutral: COLORS.primary,
} as const;

/**
 * Should this event be logged at all, given the actors involved?
 *
 * Pure and exported so a handler can bail out BEFORE doing expensive work
 * (fetching an audit log, resolving a partial) for an event nobody wants.
 */
export function shouldLog(
  config: LoggingConfig,
  event: LogEvent,
  ctx: {
    channelId?: string | null;
    userId?: string | null;
    isBot?: boolean;
    content?: string | null;
  } = {},
): boolean {
  if (!config.enabled) return false;
  if (!config[event]) return false;

  if (ctx.channelId && config.ignoreChannelIds.includes(ctx.channelId)) return false;
  if (ctx.userId && config.ignoreUserIds.includes(ctx.userId)) return false;
  if (ctx.isBot && config.ignoreBots) return false;

  // Other bots' command invocations are the loudest source of log noise.
  const content = ctx.content?.trimStart();
  if (content && config.ignorePrefixes.some((p) => content.startsWith(p))) return false;

  return true;
}

/** Where an event's embed should be posted, or null when nowhere is configured. */
export function destinationFor(
  config: LoggingConfig,
  event: LogEvent,
): string | undefined {
  const stream = EVENT_STREAM[event];
  return config[STREAM_CHANNEL[stream]] ?? config.defaultChannelId;
}

/**
 * Route an embed to its stream channel.
 *
 * Never throws: a logging failure must not take down the event that triggered
 * it. A missing channel, a revoked permission, or a database blip all end up
 * as a silent no-op (or a warn line), never an unhandled rejection.
 */
export async function emit(
  guild: Guild,
  event: LogEvent,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    const config = await loggingConfig(guild.id);
    if (!config.enabled || !config[event]) return;

    const channelId = destinationFor(config, event);
    if (!channelId) return;

    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel?.isSendable()) return;

    // Logs must never ping. A deleted message full of @everyone would otherwise
    // re-fire the ping in the log channel.
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (err) {
    botLog.warn(`Logging emit failed for ${event}: ${String(err)}`);
  }
}

/**
 * Fetch the guild's logging config without ever throwing.
 * Handlers call this first so they can run shouldLog() before doing real work.
 */
export async function configFor(guild: Guild): Promise<LoggingConfig | null> {
  try {
    return await loggingConfig(guild.id);
  } catch {
    return null;
  }
}

// ---------------- Audit log attribution ----------------

/** How stale an audit entry may be and still plausibly describe our event. */
const AUDIT_MAX_AGE_MS = 10_000;

/**
 * Best-effort "who did this?".
 *
 * Discord does not tell us who deleted a message or kicked a member: the only
 * way to find out is to read the audit log and correlate by target + recency.
 * That correlation is inherently fuzzy (two mods deleting messages in the same
 * second can be mis-attributed), so this is a nice-to-have, never a source of
 * truth, and it swallows every error: missing ViewAuditLog permission is a
 * completely normal state.
 */
export async function findExecutor(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string,
): Promise<LogUser | null> {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const entry = logs.entries.find((e: GuildAuditLogsEntry) => {
      if (Date.now() - e.createdTimestamp > AUDIT_MAX_AGE_MS) return false;
      if (!targetId) return true;
      const target = e.target as { id?: string } | null;
      return target?.id === targetId;
    });
    return entry?.executor ?? null;
  } catch {
    return null;
  }
}

/** Render an executor as an embed field value, or a neutral fallback. */
export function executorText(user: LogUser | null): string {
  if (!user) return "Unknown (no audit log access)";
  return user.tag ? `<@${user.id}> (${user.tag})` : `<@${user.id}>`;
}

export { AuditLogEvent };
