import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { prisma } from "@rukus/db";
import { COLORS, parseWhen, parseDuration, formatDuration } from "@rukus/shared";
import { remindersConfig } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** Short, unambiguous handle staff/members can type into /remind delete. */
function shortId(id: string): string {
  return id.slice(-6);
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Reminders that DM you when they're due")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("me")
        .setDescription("Set a reminder")
        .addStringOption((o) =>
          o
            .setName("when")
            .setDescription('e.g. "2h30m", "1d", "tomorrow", "at 5pm"')
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("what")
            .setDescription("What to remind you about")
            .setRequired(true)
            .setMaxLength(1000),
        )
        .addStringOption((o) =>
          o
            .setName("repeat")
            .setDescription('Repeat every, e.g. "1d" or "1w" (leave empty for one-off)'),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("Your pending reminders"),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Cancel a reminder")
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("The id shown by /remind list")
            .setRequired(true),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const config = await remindersConfig(guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "Reminders are turned off in this server.",
        ...ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "me") {
      const whenRaw = interaction.options.getString("when", true);
      const text = interaction.options.getString("what", true);
      const repeatRaw = interaction.options.getString("repeat");

      const dueMs = parseWhen(whenRaw);
      if (dueMs === null) {
        await interaction.reply({
          content:
            `I couldn't read "${whenRaw}" as a time. Try \`2h30m\`, \`1d\`, ` +
            "`45m`, `tomorrow`, or `at 5pm`.",
          ...ephemeral,
        });
        return;
      }

      let repeatSec: number | null = null;
      if (repeatRaw) {
        repeatSec = parseDuration(repeatRaw);
        if (repeatSec === null) {
          await interaction.reply({
            content: `I couldn't read "${repeatRaw}" as a duration. Try \`1d\` or \`1w\`.`,
            ...ephemeral,
          });
          return;
        }
        // A repeat faster than the sweep interval would just queue up backlog.
        if (repeatSec < 60) {
          await interaction.reply({
            content: "Repeating reminders must be at least 1 minute apart.",
            ...ephemeral,
          });
          return;
        }
      }

      const existing = await prisma.reminder.count({ where: { guildId, userId } });
      if (existing >= config.maxPerUser) {
        await interaction.reply({
          content:
            `You already have ${existing} reminder(s), the limit here is ` +
            `${config.maxPerUser}. Cancel one with \`/remind delete\`.`,
          ...ephemeral,
        });
        return;
      }

      const created = await prisma.reminder.create({
        data: {
          guildId,
          userId,
          channelId: interaction.channelId,
          text,
          dueAt: new Date(dueMs),
          repeatSec,
        },
      });

      await interaction.reply({
        content:
          `⏰ Got it. I'll remind you <t:${Math.floor(dueMs / 1000)}:R>` +
          (repeatSec ? `, then every ${formatDuration(repeatSec)}` : "") +
          `.\nId \`${shortId(created.id)}\` (cancel with \`/remind delete\`).`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "list") {
      const rows = await prisma.reminder.findMany({
        where: { guildId, userId },
        orderBy: { dueAt: "asc" },
        take: 25,
      });
      if (rows.length === 0) {
        await interaction.reply({
          content: "You have no reminders. Set one with `/remind me`.",
          ...ephemeral,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`⏰ Your reminders (${rows.length})`)
        .setDescription(
          rows
            .map(
              (r) =>
                `\`${shortId(r.id)}\` <t:${Math.floor(r.dueAt.getTime() / 1000)}:R>` +
                (r.repeatSec ? ` (every ${formatDuration(r.repeatSec)})` : "") +
                `\n${r.text.slice(0, 100)}`,
            )
            .join("\n\n")
            .slice(0, 4000),
        );
      await interaction.reply({ embeds: [embed], ...ephemeral });
      return;
    }

    // delete
    const id = interaction.options.getString("id", true).trim();
    // Match on the short handle we showed them, but scoped to their own rows so
    // a guessed suffix can never cancel somebody else's reminder.
    const mine = await prisma.reminder.findMany({ where: { guildId, userId } });
    const target = mine.find((r) => r.id === id || shortId(r.id) === id);
    if (!target) {
      await interaction.reply({
        content: `No reminder of yours has id \`${id}\`. Check \`/remind list\`.`,
        ...ephemeral,
      });
      return;
    }

    await prisma.reminder.delete({ where: { id: target.id } });
    await interaction.reply({
      content: `🗑️ Cancelled: ${target.text.slice(0, 120)}`,
      ...ephemeral,
    });
  },
};

export default command;
