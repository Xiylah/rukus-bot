import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import { prisma } from "@rukus/db";
import { COLORS } from "@rukus/shared";
import { ticketConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import { closeTicketFlow } from "./interactions.js";

/**
 * Inactivity auto-close for tickets.
 *
 * A sweeper runs every 30 minutes. For each open ticket (unless staff opted it
 * out with /ticket autoclose off):
 *   - after (closeHours - warnLead) with no messages, post a warning
 *   - if nobody says anything for warnLead more hours, close the ticket
 *   - any message after the warning clears it and restarts the clock
 *
 * Activity is derived from the channel's last message id (a snowflake encodes
 * its timestamp), so no per-message database writes are needed.
 */

const SWEEP_INTERVAL_MS = 30 * 60_000;
const DISCORD_EPOCH = 1_420_070_400_000;

export function snowflakeTime(id: string): number {
  try {
    return Number(BigInt(id) >> 22n) + DISCORD_EPOCH;
  } catch {
    return Date.now();
  }
}

/** Hours of warning lead time before the close deadline. */
export function warnLeadHours(closeHours: number): number {
  return Math.min(12, Math.max(1, closeHours / 4));
}

export type AutoCloseDecision = "none" | "clear-warning" | "warn" | "close";

/** Pure decision logic, unit-testable without Discord. */
export function decideAutoClose(input: {
  now: number;
  lastMessageTs: number;
  lastMessageId: string;
  warnedAt: number | null;
  warnedMsgId: string | null;
  closeHours: number;
}): AutoCloseDecision {
  const { now, lastMessageTs, lastMessageId, warnedAt, warnedMsgId, closeHours } =
    input;
  const leadMs = warnLeadHours(closeHours) * 3_600_000;
  const warnAfterMs = closeHours * 3_600_000 - leadMs;

  if (warnedMsgId) {
    // Someone spoke after the warning: the warning no longer applies.
    if (lastMessageId !== warnedMsgId) return "clear-warning";
    if (warnedAt !== null && now - warnedAt >= leadMs) return "close";
    return "none";
  }

  if (now - lastMessageTs >= warnAfterMs) return "warn";
  return "none";
}

/** One pass over every open ticket in every guild the bot serves. */
export async function sweepInactiveTickets(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await ticketConfig(guild.id);
      if (!config.autoCloseEnabled) continue;

      const tickets = await prisma.ticket.findMany({
        where: {
          guildId: guild.id,
          status: { in: ["OPEN", "CLAIMED"] },
          autoCloseDisabled: false,
        },
      });

      for (const t of tickets) {
        const channel =
          guild.channels.cache.get(t.channelId) ??
          (await guild.channels.fetch(t.channelId).catch(() => null));

        // Channel is gone: close the orphaned row so it stops being swept.
        if (!channel || !channel.isTextBased()) {
          await prisma.ticket.update({
            where: { channelId: t.channelId },
            data: { status: "CLOSED", closedAt: new Date() },
          });
          continue;
        }

        const lastId = channel.lastMessageId ?? t.channelId;
        const decision = decideAutoClose({
          now: Date.now(),
          lastMessageTs: snowflakeTime(lastId),
          lastMessageId: lastId,
          warnedAt: t.autoCloseWarnedAt?.getTime() ?? null,
          warnedMsgId: t.autoCloseWarnedMsgId,
          closeHours: config.autoCloseHours,
        });

        if (decision === "clear-warning") {
          await prisma.ticket.update({
            where: { channelId: t.channelId },
            data: { autoCloseWarnedAt: null, autoCloseWarnedMsgId: null },
          });
        } else if (decision === "warn") {
          const lead = warnLeadHours(config.autoCloseHours);
          const embed = new EmbedBuilder()
            .setColor(COLORS.warning)
            .setTitle("⏰ This ticket looks inactive")
            .setDescription(
              `No messages for a while, so this ticket will close automatically ` +
                `in about **${lead} hour(s)**.\n` +
                `Send any message to keep it open, or staff can run ` +
                "`/ticket autoclose enabled:False` to exempt this ticket.",
            );
          const msg = await (channel as TextChannel)
            .send({ content: `<@${t.openerId}>`, embeds: [embed] })
            .catch(() => null);
          if (msg) {
            await prisma.ticket.update({
              where: { channelId: t.channelId },
              data: { autoCloseWarnedAt: new Date(), autoCloseWarnedMsgId: msg.id },
            });
          }
        } else if (decision === "close") {
          log.info(`Auto-closing inactive ticket #${t.number} in ${guild.name}`);
          const result = await closeTicketFlow(
            channel as TextChannel,
            config,
            client.user!.id,
          );
          if (result.ok) {
            await (channel as TextChannel)
              .send({
                content: `⏰ Auto-closed after ${config.autoCloseHours}h of inactivity.`,
              })
              .catch(() => {});
          }
        }
      }
    } catch (err) {
      log.error(`Auto-close sweep failed for guild ${guild.id}:`, err);
    }
  }
}

/** Start the recurring sweep (first pass shortly after boot). */
export function startAutoCloseSweeper(client: Client): void {
  setTimeout(() => void sweepInactiveTickets(client), 60_000);
  setInterval(() => void sweepInactiveTickets(client), SWEEP_INTERVAL_MS);
  log.info("Ticket auto-close sweeper started (every 30 min).");
}
