import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { prisma } from "@rukus/db";
import { highlightsConfig } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("highlight")
    .setDescription("Get a DM when a word you care about is said")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Start watching a word or phrase")
        .addStringOption((o) =>
          o
            .setName("word")
            .setDescription("The word or phrase to watch")
            .setRequired(true)
            .setMaxLength(60),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Stop watching a word")
        .addStringOption((o) =>
          o.setName("word").setDescription("The word to drop").setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Your watched words"))
    .addSubcommand((s) =>
      s.setName("clear").setDescription("Stop watching everything"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const config = await highlightsConfig(guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "Highlights are turned off in this server.",
        ...ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      // Lowercase on the way in: matching is case-insensitive, so storing both
      // "Rukus" and "rukus" would just be two rows that mean the same thing.
      const word = interaction.options.getString("word", true).trim().toLowerCase();
      if (word.length < 2) {
        await interaction.reply({
          content: "That's too short to be useful, use at least 2 characters.",
          ...ephemeral,
        });
        return;
      }

      const count = await prisma.highlight.count({ where: { guildId, userId } });
      if (count >= config.maxPerUser) {
        await interaction.reply({
          content: `You're at the limit of ${config.maxPerUser} highlight(s). Remove one first.`,
          ...ephemeral,
        });
        return;
      }

      const existing = await prisma.highlight.findFirst({
        where: { guildId, userId, word },
      });
      if (existing) {
        await interaction.reply({
          content: `You're already watching **${word}**.`,
          ...ephemeral,
        });
        return;
      }

      await prisma.highlight.create({ data: { guildId, userId, word } });
      await interaction.reply({
        content:
          `🔔 Watching **${word}**. I'll DM you when it's said, unless you've ` +
          "spoken in that channel recently.",
        ...ephemeral,
      });
      return;
    }

    if (sub === "remove") {
      const word = interaction.options.getString("word", true).trim().toLowerCase();
      const { count } = await prisma.highlight.deleteMany({
        where: { guildId, userId, word },
      });
      await interaction.reply({
        content: count
          ? `🔕 No longer watching **${word}**.`
          : `You weren't watching **${word}**.`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "list") {
      const rows = await prisma.highlight.findMany({
        where: { guildId, userId },
        orderBy: { createdAt: "asc" },
      });
      await interaction.reply({
        content: rows.length
          ? `🔔 You're watching: ${rows.map((r) => `**${r.word}**`).join(", ")}`
          : "You aren't watching any words. Add one with `/highlight add`.",
        ...ephemeral,
      });
      return;
    }

    // clear
    const { count } = await prisma.highlight.deleteMany({ where: { guildId, userId } });
    await interaction.reply({
      content: count
        ? `🔕 Cleared ${count} highlight(s).`
        : "You had nothing to clear.",
      ...ephemeral,
    });
  },
};

export default command;
