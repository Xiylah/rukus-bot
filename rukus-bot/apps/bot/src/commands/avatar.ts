import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a user's avatar full-size")
    .addUserOption((o) =>
      o.setName("user").setDescription("Whose avatar (default: yours)"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`${user.displayName}'s avatar`)
      .setImage(user.displayAvatarURL({ size: 1024 }));
    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
