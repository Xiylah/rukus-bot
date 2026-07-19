import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";
import { economyConfig } from "../lib/configCache.js";
import { claimDaily } from "../features/economy/service.js";
import { money } from "../features/economy/ui.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily reward")
    .setDMPermission(false),

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

    if (config.dailyAmount <= 0) {
      await interaction.reply({
        content: "This server has no daily reward set up.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const result = await claimDaily(
      interaction.guildId,
      interaction.user.id,
      config.dailyAmount,
      config.dailyStreakBonus,
      config.dailyStreakCap,
    );

    if (!result.ok) {
      // A relative timestamp rather than a duration string: Discord renders it
      // in the member's own timezone and keeps counting down on its own.
      const when = result.nextClaimAt
        ? `<t:${Math.ceil(result.nextClaimAt.getTime() / 1000)}:R>`
        : "soon";
      await interaction.editReply({
        content: `You have already claimed today. Come back ${when}.`,
      });
      return;
    }

    const capped = result.streak >= config.dailyStreakCap;
    const bonus =
      config.dailyStreakBonus *
      (Math.min(result.streak, config.dailyStreakCap) - 1);

    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle(`${config.currencySymbol} Daily claimed`)
      .setDescription(
        `You picked up ${money(config, result.amount)} ${config.currencyName}.`,
      )
      .addFields(
        {
          name: "Streak",
          value: capped
            ? `${result.streak} days (bonus maxed)`
            : `${result.streak} days`,
          inline: true,
        },
        {
          name: "New balance",
          value: money(config, result.balance),
          inline: true,
        },
      );

    if (bonus > 0) {
      embed.addFields({
        name: "Streak bonus",
        value: money(config, bonus),
        inline: true,
      });
    }

    if (!capped && config.dailyStreakBonus > 0) {
      embed.setFooter({
        text: `Claim again tomorrow for +${config.dailyStreakBonus} more. Miss a day and the streak restarts.`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
