import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show information about this server")
    .setDMPermission(false),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const g = interaction.guild;
    const channels = g.channels.cache;
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(g.name)
      .setThumbnail(g.iconURL({ size: 256 }))
      .addFields(
        { name: "Members", value: String(g.memberCount), inline: true },
        { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
        {
          name: "Created",
          value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
        {
          name: "Channels",
          value: `${channels.filter((c) => c.type === ChannelType.GuildText).size} text, ${channels.filter((c) => c.type === ChannelType.GuildVoice).size} voice`,
          inline: true,
        },
        { name: "Roles", value: String(g.roles.cache.size), inline: true },
        { name: "Boosts", value: String(g.premiumSubscriptionCount ?? 0), inline: true },
      );
    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
