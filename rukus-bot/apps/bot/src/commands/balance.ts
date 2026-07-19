import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";
import { economyConfig } from "../lib/configCache.js";
import { getBalance, getRank } from "../features/economy/service.js";
import { money } from "../features/economy/ui.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Show your balance, lifetime earnings and rank")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Whose balance to show (default: you)"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await economyConfig(interaction.guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "The economy is turned off in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const user = interaction.options.getUser("user") ?? interaction.user;
    if (user.bot) {
      await interaction.reply({
        content: `Bots don't earn ${config.currencyName}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    // Only grant the starting balance to the person actually running the
    // command. Looking someone up must never create a row for them, or a member
    // could seed the leaderboard by /balance-ing every name in the server.
    const own = user.id === interaction.user.id;
    const row = await getBalance(
      interaction.guildId,
      user.id,
      own ? config.startingBalance : 0,
    );
    const { rank, total } = await getRank(
      interaction.guildId,
      user.id,
      row.amount,
    );

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || COLORS.primary)
      .setAuthor({
        name: user.displayName || user.username,
        iconURL: user.displayAvatarURL({ size: 128 }),
      })
      .addFields(
        {
          name: "Balance",
          value: money(config, row.amount),
          inline: true,
        },
        {
          name: "Earned all time",
          value: money(config, row.lifetime),
          inline: true,
        },
        {
          name: "Rank",
          value: total > 0 ? `#${rank} of ${total}` : "Unranked",
          inline: true,
        },
      );

    if (row.dailyStreak > 0) {
      embed.setFooter({ text: `Daily streak: ${row.dailyStreak} days` });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
