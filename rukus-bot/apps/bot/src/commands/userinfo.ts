import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show information about a member")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Who to look up (default: you)"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const user = interaction.options.getUser("user") ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || COLORS.primary)
      .setTitle(member?.displayName ?? user.username)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Username", value: user.tag, inline: true },
        { name: "ID", value: user.id, inline: true },
        {
          name: "Account created",
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
      );

    if (member) {
      embed.addFields(
        {
          name: "Joined server",
          value: member.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
            : "unknown",
          inline: true,
        },
        {
          name: `Roles (${member.roles.cache.size - 1})`,
          value:
            member.roles.cache
              .filter((r) => r.id !== interaction.guildId)
              .sort((a, b) => b.position - a.position)
              .map((r) => `<@&${r.id}>`)
              .slice(0, 15)
              .join(" ") || "none",
        },
      );
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
