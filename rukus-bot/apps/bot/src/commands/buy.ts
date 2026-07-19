import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { economyConfig, shopConfig } from "../lib/configCache.js";
import {
  logPurchase,
  postFulfilRequest,
  purchase,
} from "../features/shop/service.js";
import { failureMessage } from "../features/shop/ui.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/**
 * /buy, for people who would rather type than click through /shop.
 *
 * The item is matched by id or by case-insensitive name (see findItem). This
 * deliberately does NOT use autocomplete: the bot has no autocomplete router
 * yet, and an option that never responds leaves the user staring at an empty
 * dropdown with no way to type past it. A plain string is worse-looking and
 * strictly more usable until that routing exists.
 */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy something from the server shop")
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName("item")
        .setDescription("Item name (exactly as shown in /shop)")
        .setRequired(true),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const [config, economy] = await Promise.all([
      shopConfig(interaction.guildId),
      economyConfig(interaction.guildId),
    ]);
    if (!config.enabled) {
      await interaction.reply({
        content: "The shop isn't enabled on this server.",
        ...ephemeral,
      });
      return;
    }

    await interaction.deferReply(ephemeral);

    const query = interaction.options.getString("item", true);
    const member = interaction.member as GuildMember;
    const result = await purchase(interaction.guildId, member, query, config);

    if (!result.ok) {
      await interaction.editReply({
        content: failureMessage(result.reason, economy, result.item),
      });
      return;
    }

    const { item, purchaseId, pending } = result;
    if (pending) {
      await postFulfilRequest(
        interaction.guild,
        config,
        member,
        item,
        purchaseId,
      );
    }
    await logPurchase(interaction.guild, config, member, item, purchaseId);

    await interaction.editReply({
      content: pending
        ? `Bought **${item.name}** for ${economy.currencySymbol} ${item.price}. Staff have been notified. Order id \`${purchaseId}\`.`
        : `Bought **${item.name}** for ${economy.currencySymbol} ${item.price}. Enjoy!`,
    });
  },
};

export default command;
