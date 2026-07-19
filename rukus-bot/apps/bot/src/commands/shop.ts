import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { economyConfig, shopConfig } from "../lib/configCache.js";
import { renderShop } from "../features/shop/interactions.js";
import { fulfilPurchase } from "../features/shop/service.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Browse the server shop")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("Browse what's for sale")
        .addIntegerOption((o) =>
          o
            .setName("page")
            .setDescription("Which page to open on")
            .setMinValue(1),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("fulfil")
        .setDescription("Staff: mark a custom order as done")
        .addStringOption((o) =>
          o
            .setName("purchase_id")
            .setDescription("The order id from the fulfil channel")
            .setRequired(true),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await shopConfig(interaction.guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "The shop isn't enabled on this server.",
        ...ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "fulfil") {
      // Staff-only in code as well as on the builder: default member
      // permissions are a UI hint a server admin can override, not a guarantee.
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)
      ) {
        await interaction.reply({
          content: "You don't have permission to fulfil orders.",
          ...ephemeral,
        });
        return;
      }

      const purchaseId = interaction.options.getString("purchase_id", true);
      const done = await fulfilPurchase(interaction.guildId, purchaseId);
      if (!done) {
        await interaction.reply({
          content:
            "No pending order with that id. It may already have been fulfilled.",
          ...ephemeral,
        });
        return;
      }
      await interaction.reply({
        content: `Marked **${done.itemName}** for <@${done.userId}> as fulfilled.`,
        allowedMentions: { parse: [] },
        ...ephemeral,
      });
      return;
    }

    // ---- view ----
    await interaction.deferReply(ephemeral);
    const economy = await economyConfig(interaction.guildId);
    const page = (interaction.options.getInteger("page") ?? 1) - 1;
    const payload = await renderShop(
      interaction.guildId,
      interaction.guild.name,
      interaction.user.id,
      config,
      economy,
      page,
    );
    await interaction.editReply(payload);
  },
};

export default command;
