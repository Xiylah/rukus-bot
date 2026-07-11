import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  TextChannel,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set this channel's slowmode")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addIntegerOption((o) =>
      o
        .setName("seconds")
        .setDescription("Delay between messages (0 = off, max 21600)")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const seconds = interaction.options.getInteger("seconds", true);
    const channel = interaction.channel as TextChannel;
    await channel.setRateLimitPerUser(seconds, `Set by ${interaction.user.tag}`);
    await interaction.reply({
      content:
        seconds === 0
          ? "🐇 Slowmode disabled."
          : `🐢 Slowmode set to ${seconds}s.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
