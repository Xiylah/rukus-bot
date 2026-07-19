import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { prisma } from "@rukus/db";
import { economyConfig, shopConfig } from "../lib/configCache.js";
import { balanceOf } from "../features/shop/economy.js";
import { activeBoosts, PURCHASE_STATUS } from "../features/shop/service.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** Most recent purchases shown; older ones stay in the table for staff. */
const RECENT_LIMIT = 15;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("See what you've bought and any active boosts")
    .setDMPermission(false),

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

    await interaction.deferReply(ephemeral);

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const [economy, purchases, boosts, balance] = await Promise.all([
      economyConfig(guildId),
      prisma.purchase.findMany({
        where: {
          guildId,
          userId,
          status: {
            in: [PURCHASE_STATUS.complete, PURCHASE_STATUS.pending],
          },
        },
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
      }),
      activeBoosts(guildId, userId),
      balanceOf(guildId, userId),
    ]);

    const embed = new EmbedBuilder()
      .setTitle("🎒 Your inventory")
      .setColor(0x5865f2)
      .setFooter({
        text: `Balance: ${balance} ${economy.currencyName}`,
      });

    if (boosts.length > 0) {
      embed.addFields({
        name: "Active boosts",
        // A relative timestamp rather than a computed "2h left": Discord
        // renders it in the reader's own clock and keeps counting down without
        // the message going stale.
        value: boosts
          .map(
            (b) =>
              `${b.multiplier}x XP, expires <t:${Math.floor(b.expiresAt.getTime() / 1000)}:R>`,
          )
          .join("\n"),
      });
    }

    if (purchases.length === 0) {
      embed.setDescription("You haven't bought anything yet. Try `/shop`.");
    } else {
      embed.addFields({
        name: `Purchases (last ${Math.min(purchases.length, RECENT_LIMIT)})`,
        value: purchases
          .map((p) => {
            const when = `<t:${Math.floor(p.createdAt.getTime() / 1000)}:d>`;
            const flag =
              p.status === PURCHASE_STATUS.pending ? " *(awaiting staff)*" : "";
            return `**${p.itemName}** - ${p.price} • ${when}${flag}`;
          })
          .join("\n")
          .slice(0, 1024),
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
