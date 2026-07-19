import { ChannelType, EmbedBuilder, type Guild } from "discord.js";
import { prisma, type Contest } from "@rukus/db";
import type { ContestsConfig } from "@rukus/shared";
import { log } from "../../lib/logger.js";
import { localNow } from "../birthdays/dates.js";
import { activeContestFor } from "./service.js";

/**
 * Auto-starting a contest on a weekly schedule.
 *
 * Same shape as the birthday sweeper and for the same reason: Intl.DateTimeFormat
 * already knows every IANA zone, so we ask "what day and hour is it in the
 * guild's timezone" on every pass rather than adding a tz dependency or trusting
 * an in-process timer that a Railway redeploy would kill.
 *
 * WHY the last auto-started Contest row is the double-start guard rather than a
 * new column: a restart must not be able to re-fire an occurrence, so the guard
 * has to be durable, and the contest we created IS the durable record that the
 * occurrence happened. That means no schema change and no way for the guard to
 * disagree with reality.
 */

/**
 * Marks a contest as machine-started. Written into `description` is not an
 * option (members read it), and there is no boolean column, so the hostId is
 * the flag: a real host is a Discord user id, and "system" cannot collide with
 * one because snowflakes are always digits.
 */
export const RECURRING_HOST_ID = "system:recurring";

/** Day names for logging and the announcement, indexed 0 = Sunday. */
const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? "Sunday";
}

/**
 * Which weekday it is right now in `timezone`, 0 = Sunday.
 *
 * localNow gives the calendar date but not the weekday, and deriving the
 * weekday from that date has to be done in UTC (Date.UTC) or the runtime's own
 * offset creeps back in and shifts the answer by a day near midnight.
 */
export function localDayOfWeek(timezone: string, now: Date = new Date()): number {
  const today = localNow(timezone, now);
  return new Date(
    Date.UTC(today.year, today.month - 1, today.day),
  ).getUTCDay();
}

/**
 * A stable key for "the occurrence that should be running right now".
 *
 * The guild's local calendar date at the moment the occurrence fires. Two
 * sweeps in the same hour produce the same key, and so does a sweep after a
 * restart, which is what makes the guard idempotent.
 */
export function occurrenceKey(timezone: string, now: Date = new Date()): string {
  const today = localNow(timezone, now);
  return `${today.year}-${today.month}-${today.day}`;
}

/**
 * Is this the configured day and hour, in the guild's own timezone?
 *
 * Hour is `>=` rather than `===` so an occurrence is not lost to downtime: if
 * the bot was down at 12:00 it still starts the contest at 13:00 the same day.
 * It cannot run twice, because the durable guard below rejects the second one.
 */
export function isOccurrenceDue(
  config: ContestsConfig,
  now: Date = new Date(),
): boolean {
  if (localDayOfWeek(config.timezone, now) !== config.recurringDayOfWeek) {
    return false;
  }
  return localNow(config.timezone, now).hour >= config.recurringHour;
}

/**
 * Has this occurrence already fired?
 *
 * Looks for an auto-started contest whose creation falls on the same local
 * calendar day as the occurrence we are about to start. Restart-safe: the row
 * outlives the process.
 */
async function alreadyStarted(
  guildId: string,
  config: ContestsConfig,
  now: Date,
): Promise<boolean> {
  const last = await prisma.contest
    .findFirst({
      where: { guildId, hostId: RECURRING_HOST_ID },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => null);
  if (!last) return false;
  return (
    occurrenceKey(config.timezone, last.createdAt) ===
    occurrenceKey(config.timezone, now)
  );
}

/** The channels a recurring contest runs in, or null when none are usable. */
function recurringChannelIds(config: ContestsConfig): string[] | null {
  // Unlike /contest start there is no "current channel" to fall back to, so a
  // schedule with no configured channels simply cannot run.
  const ids = [...new Set(config.defaultChannelIds)];
  return ids.length > 0 ? ids : null;
}

/**
 * Start this guild's scheduled contest if it is due and not already running.
 *
 * Returns the contest when one was started, else null. Every skip reason is a
 * quiet null rather than a throw: a schedule that cannot run must not take the
 * sweeper down for the other guilds.
 */
export async function maybeStartRecurring(
  guild: Guild,
  config: ContestsConfig,
  now: Date = new Date(),
): Promise<Contest | null> {
  if (!config.enabled || !config.recurringEnabled) return null;
  if (!isOccurrenceDue(config, now)) return null;

  const channelIds = recurringChannelIds(config);
  if (!channelIds) {
    log.warn(
      `Contest schedule for guild ${guild.id} has no default channels, skipping.`,
    );
    return null;
  }

  if (await alreadyStarted(guild.id, config, now)) return null;

  // A channel can only host one contest at a time, or an entry would be
  // ambiguous. A host who started one manually owns the channel this week.
  for (const id of channelIds) {
    const running = await activeContestFor(guild.id, id);
    if (running) {
      log.info(
        `Skipping recurring contest in ${guild.id}: "${running.title}" already running in ${id}.`,
      );
      return null;
    }
  }

  const endsAt = new Date(
    now.getTime() + config.recurringDurationHours * 3_600_000,
  );
  const title = config.recurringTitle || "Weekly Contest";

  const contest = await prisma.contest.create({
    data: {
      guildId: guild.id,
      channelIds,
      hostId: RECURRING_HOST_ID,
      title,
      description: "",
      winnerCount: config.defaultWinnerCount,
      endsAt,
    },
  });

  await announceStart(guild, config, contest, channelIds);
  return contest;
}

/** Post the "contest is open" embed in each of the contest's channels. */
async function announceStart(
  guild: Guild,
  config: ContestsConfig,
  contest: Contest,
  channelIds: string[],
): Promise<void> {
  const where =
    channelIds.length === 1
      ? "in this channel"
      : `in ${channelIds.map((id) => `<#${id}>`).join(", ")}`;

  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(config.embedColor.slice(1), 16))
    .setTitle(`📸 ${contest.title}`)
    .setDescription(
      `Post your image or video ${where} to enter.\n` +
        `Vote by reacting ${config.voteEmoji} on the entries you like.`,
    )
    .addFields(
      {
        name: "Ends",
        value: `<t:${Math.floor(contest.endsAt.getTime() / 1000)}:R>`,
        inline: true,
      },
      { name: "Places", value: `Top ${contest.winnerCount}`, inline: true },
      {
        name: "Entries per person",
        value:
          config.maxEntriesPerUser > 0
            ? String(config.maxEntriesPerUser)
            : "Unlimited",
        inline: true,
      },
    )
    .setFooter({ text: "Self-votes do not count." })
    .setTimestamp(contest.endsAt);

  let firstPostedId: string | null = null;
  for (const id of channelIds) {
    const target =
      guild.channels.cache.get(id) ??
      (await guild.channels.fetch(id).catch(() => null));
    if (!target) continue;

    // A forum has no message list to send into: the announcement has to be a
    // post (a thread) instead, and members then enter by replying in it.
    if (target.type === ChannelType.GuildForum) {
      const thread = await target.threads
        .create({
          name: contest.title.slice(0, 100),
          message: { embeds: [embed] },
        })
        .catch(() => null);
      if (thread && !firstPostedId) {
        const starter = await thread.fetchStarterMessage().catch(() => null);
        if (starter) firstPostedId = starter.id;
      }
      continue;
    }

    if (!target.isSendable()) continue;
    const posted = await target.send({ embeds: [embed] }).catch(() => null);
    if (posted && !firstPostedId) firstPostedId = posted.id;
  }

  if (firstPostedId) {
    await prisma.contest
      .update({ where: { id: contest.id }, data: { messageId: firstPostedId } })
      .catch(() => null);
  }
}
