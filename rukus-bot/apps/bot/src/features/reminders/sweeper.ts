import { EmbedBuilder, type Client } from "discord.js";
import { prisma } from "@rukus/db";
import { COLORS, formatDuration } from "@rukus/shared";
import { log } from "../../lib/logger.js";

/**
 * Fires due reminders.
 *
 * Same shape as the ticket auto-close sweeper: one interval, one pass over the
 * rows that are actually due. Polling beats an in-process setTimeout per
 * reminder because a Railway redeploy restarts the process, and a timer that
 * only lives in memory dies with it. The database is the schedule.
 */

const SWEEP_INTERVAL_MS = 30_000;

/** Deliver one reminder. DM first, channel with a mention as the fallback. */
async function deliver(
  client: Client,
  r: {
    id: string;
    guildId: string;
    userId: string;
    channelId: string;
    text: string;
    repeatSec: number | null;
    dueAt: Date;
  },
): Promise<void> {
  const late = Math.round((Date.now() - r.dueAt.getTime()) / 1000);
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle("⏰ Reminder")
    .setDescription(r.text.slice(0, 4000))
    .setFooter({
      text: r.repeatSec
        ? `Repeats every ${formatDuration(r.repeatSec)}`
        : late > 60
          ? `Delivered ${formatDuration(late)} late`
          : "One-off reminder",
    });

  const user = await client.users.fetch(r.userId).catch(() => null);
  const dmed = user
    ? await user
        .send({ embeds: [embed] })
        .then(() => true)
        .catch(() => false)
    : false;

  if (!dmed) {
    // DMs closed. Fall back to the channel they set it in, with a ping so it
    // still reaches them: a reminder nobody sees is worse than a little noise.
    const channel = await client.channels.fetch(r.channelId).catch(() => null);
    if (channel?.isSendable()) {
      await channel
        .send({
          content: `<@${r.userId}> (your DMs are closed, so here it is)`,
          embeds: [embed],
          allowedMentions: { users: [r.userId] },
        })
        .catch(() => {});
    }
  }
}

/** One pass over every reminder whose time has come. */
export async function sweepReminders(client: Client): Promise<void> {
  try {
    const due = await prisma.reminder.findMany({
      where: { dueAt: { lte: new Date() } },
      orderBy: { dueAt: "asc" },
      take: 100,
    });

    for (const r of due) {
      // Reschedule (or delete) BEFORE delivering. If the delivery throws or the
      // process dies mid-send, the row is already out of the due set, so the
      // worst case is one missed reminder rather than an infinite redelivery
      // loop that DMs the member every 30 seconds forever.
      if (r.repeatSec) {
        // Skip forward past any missed occurrences (the bot may have been down)
        // so a week of downtime doesn't fire a week of backlog at once.
        const stepMs = r.repeatSec * 1000;
        let next = r.dueAt.getTime() + stepMs;
        const now = Date.now();
        if (next <= now) {
          next += Math.ceil((now - next) / stepMs) * stepMs;
        }
        await prisma.reminder.update({
          where: { id: r.id },
          data: { dueAt: new Date(next) },
        });
      } else {
        await prisma.reminder.delete({ where: { id: r.id } });
      }

      await deliver(client, r);
    }
  } catch (err) {
    log.error("Reminder sweep failed:", err);
  }
}

/** Start the recurring sweep (first pass shortly after boot). */
export function startReminderSweeper(client: Client): void {
  setTimeout(() => void sweepReminders(client), 15_000);
  setInterval(() => void sweepReminders(client), SWEEP_INTERVAL_MS);
  log.info("Reminder sweeper started (every 30s).");
}
