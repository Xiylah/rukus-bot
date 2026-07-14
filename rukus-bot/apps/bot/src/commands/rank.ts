import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../lib/types.js";
import { levelingConfig } from "../lib/configCache.js";
import { getRank } from "../features/leveling/service.js";
import { rankEmbed } from "../features/leveling/ui.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your level, XP, and server rank")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Whose rank to show (default: you)"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await levelingConfig(interaction.guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "Leveling is turned off in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const user = interaction.options.getUser("user") ?? interaction.user;
    if (user.bot) {
      await interaction.reply({
        content: "Bots don't earn XP.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = await getRank(interaction.guildId, user.id);
    if (!result) {
      await interaction.reply({
        content:
          user.id === interaction.user.id
            ? "You haven't earned any XP yet. Send a message and try again."
            : `${user.displayName} hasn't earned any XP yet.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    await interaction.reply({
      embeds: [
        rankEmbed(
          user,
          result.row,
          result.rank,
          result.total,
          member?.displayColor ?? 0,
        ),
      ],
    });
  },
};

export default command;
