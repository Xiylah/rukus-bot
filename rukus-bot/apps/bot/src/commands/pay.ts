import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";
import { economyConfig } from "../lib/configCache.js";
import { transfer } from "../features/economy/service.js";
import { money } from "../features/economy/ui.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Send some of your balance to another member")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Who to pay").setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("How much to send")
        .setMinValue(1)
        .setMaxValue(1_000_000_000)
        .setRequired(true),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await economyConfig(interaction.guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "The economy is turned off in this server.",
        ...ephemeral,
      });
      return;
    }

    if (!config.payEnabled) {
      await interaction.reply({
        content: "Transfers are turned off in this server.",
        ...ephemeral,
      });
      return;
    }

    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);

    if (target.bot) {
      await interaction.reply({
        content: `Bots can't hold ${config.currencyName}.`,
        ...ephemeral,
      });
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.reply({
        content: "You can't pay yourself.",
        ...ephemeral,
      });
      return;
    }

    // The builder's setMinValue already rejects this, but a stale client can
    // still send anything, and a negative amount here would reverse the
    // transfer and drain the recipient.
    if (amount <= 0) {
      await interaction.reply({
        content: "Send a positive amount.",
        ...ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const result = await transfer(
      interaction.guildId,
      interaction.user.id,
      target.id,
      amount,
      config.payTaxPercent,
    );

    if (!result.ok) {
      await interaction.editReply({
        content: `You don't have ${money(config, amount)} to send.`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setDescription(
        `${interaction.user} sent ${money(config, result.received)} to ${target}.`,
      );

    if (result.tax > 0n) {
      embed.setFooter({
        text: `${config.payTaxPercent}% transfer tax took ${result.tax.toLocaleString()}. ${amount.toLocaleString()} left your balance.`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
