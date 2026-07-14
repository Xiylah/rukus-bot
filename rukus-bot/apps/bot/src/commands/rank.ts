import {
  SlashCommandBuilder,
  MessageFlags,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { levelProgress } from "@rukus/shared";
import type { Command } from "../lib/types.js";
import { levelingConfig } from "../lib/configCache.js";
import { getRank } from "../features/leveling/service.js";
import { rankEmbed } from "../features/leveling/ui.js";
import { renderRankCard } from "../features/leveling/card.js";

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

    // Rendering the card may fetch a remote background, so the 3s reply window
    // is not something we can count on.
    await interaction.deferReply();

    const progress = levelProgress(result.row.xp);
    const png = await renderRankCard({
      username: member?.displayName || user.displayName || user.username,
      avatarUrl: (member ?? user).displayAvatarURL({
        extension: "png",
        size: 256,
      }),
      level: progress.level,
      rank: result.rank,
      xpInLevel: progress.currentXp,
      xpForLevel: progress.neededXp,
      totalXp: progress.totalXp,
      card: config.card,
    });

    if (png) {
      await interaction.editReply({
        files: [new AttachmentBuilder(png, { name: "rank.png" })],
      });
      return;
    }

    await interaction.editReply({
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
