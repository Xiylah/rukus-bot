import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";
import { birthdaysConfig } from "../lib/configCache.js";
import {
  formatDayMonth,
  isRealDate,
  localNow,
} from "../features/birthdays/dates.js";
import {
  getBirthday,
  removeBirthday,
  setBirthday,
  upcomingBirthdays,
} from "../features/birthdays/service.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The year a birthday can plausibly be in. The lower bound is a sanity check,
 * not a judgement; the upper bound is "not in the future", which we check
 * against the real clock at call time.
 */
const MIN_YEAR = 1900;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Tell the server when your birthday is")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Save your birthday")
        .addIntegerOption((o) =>
          o
            .setName("day")
            .setDescription("Day of the month")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(31),
        )
        .addIntegerOption((o) =>
          o
            .setName("month")
            .setDescription("Month")
            .setRequired(true)
            .addChoices(
              ...MONTHS.map((name, i) => ({ name, value: i + 1 })),
            ),
        )
        .addIntegerOption((o) =>
          o
            .setName("year")
            .setDescription("Optional, and never shown to anyone")
            .setMinValue(MIN_YEAR),
        ),
    )
    .addSubcommand((s) =>
      s.setName("remove").setDescription("Delete your birthday from the server"),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("The birthdays coming up next"),
    )
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("See someone's birthday")
        .addUserOption((o) =>
          o.setName("user").setDescription("Whose birthday (default: you)"),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;

    const config = await birthdaysConfig(guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "Birthdays are turned off in this server.",
        ...ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const day = interaction.options.getInteger("day", true);
      const month = interaction.options.getInteger("month", true);
      const year = interaction.options.getInteger("year");

      if (!isRealDate(day, month, year)) {
        await interaction.reply({
          content: `${formatDayMonth(day, month)} isn't a real date${
            year ? ` in ${year}` : ""
          }. Check the day and try again.`,
          ...ephemeral,
        });
        return;
      }

      if (year !== null && year > new Date().getUTCFullYear()) {
        await interaction.reply({
          content: "That year is in the future.",
          ...ephemeral,
        });
        return;
      }

      await setBirthday(guildId, interaction.user.id, day, month, year);

      await interaction.reply({
        content:
          `🎂 Saved: **${formatDayMonth(day, month)}**.` +
          (year
            ? " Your birth year is stored but never shown to anyone, and the bot never posts your age."
            : "") +
          "\nRemove it any time with `/birthday remove`.",
        ...ephemeral,
      });
      return;
    }

    if (sub === "remove") {
      const had = await removeBirthday(guildId, interaction.user.id);
      await interaction.reply({
        content: had
          ? "🗑️ Deleted. The server no longer has your birthday."
          : "You haven't set a birthday here.",
        ...ephemeral,
      });
      return;
    }

    if (sub === "list") {
      const today = localNow(config.timezone);
      const rows = await upcomingBirthdays(guildId, today);
      if (rows.length === 0) {
        await interaction.reply({
          content: "Nobody has set a birthday yet. Be the first: `/birthday set`.",
          ...ephemeral,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle("🎂 Birthdays coming up")
        .setDescription(
          rows
            .map((b) => {
              const when =
                b.inDays === 0
                  ? "**today**"
                  : b.inDays === 1
                    ? "tomorrow"
                    : `in ${b.inDays} days`;
              return `<@${b.userId}> - ${formatDayMonth(b.day, b.month)} (${when})`;
            })
            .join("\n")
            .slice(0, 4000),
        );

      await interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
      return;
    }

    // view
    const user = interaction.options.getUser("user") ?? interaction.user;
    const birthday = await getBirthday(guildId, user.id);
    if (!birthday) {
      await interaction.reply({
        content:
          user.id === interaction.user.id
            ? "You haven't set a birthday. Add one with `/birthday set`."
            : `${user.displayName} hasn't set a birthday.`,
        ...ephemeral,
      });
      return;
    }

    // Day and month only. The stored year is nobody else's business.
    await interaction.reply({
      content: `🎂 ${user.id === interaction.user.id ? "Your birthday" : `${user.displayName}'s birthday`} is **${formatDayMonth(birthday.day, birthday.month)}**.`,
      ...ephemeral,
    });
  },
};

export default command;
