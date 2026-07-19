import {
  MessageFlags,
  type ButtonInteraction,
  type GuildMember,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { EconomyConfig, ShopConfig } from "@rukus/shared";
import { economyConfig, shopConfig } from "../../lib/configCache.js";
import { balanceOf } from "./economy.js";
import {
  logPurchase,
  postFulfilRequest,
  purchase,
  stockLeft,
} from "./service.js";
import {
  failureMessage,
  shopComponents,
  shopEmbed,
  totalPages,
  PAGE_SIZE,
  type ShopRow,
} from "./ui.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/**
 * Build one page of the catalogue.
 *
 * Only the visible slice is priced up: stockLeft is a count query per item, so
 * doing the whole catalogue would be up to 100 queries to render five rows.
 */
export async function buildPage(
  guildId: string,
  userId: string,
  config: ShopConfig,
  page: number,
): Promise<{ rows: ShopRow[]; page: number; pages: number; balance: bigint }> {
  const listed = config.items.filter((i) => i.enabled);
  const pages = totalPages(listed.length);
  const safePage = Math.min(Math.max(0, page), pages - 1);
  const slice = listed.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const balance = await balanceOf(guildId, userId);
  const rows: ShopRow[] = await Promise.all(
    slice.map(async (item) => ({
      item,
      left: await stockLeft(guildId, item),
      affordable: balance >= BigInt(item.price),
    })),
  );
  return { rows, page: safePage, pages, balance };
}

/** Render a page into an interaction payload. */
export async function renderShop(
  guildId: string,
  guildName: string,
  userId: string,
  config: ShopConfig,
  economy: EconomyConfig,
  page: number,
) {
  const { rows, page: p, pages, balance } = await buildPage(
    guildId,
    userId,
    config,
    page,
  );
  return {
    embeds: [shopEmbed(rows, p, pages, economy, balance, guildName)],
    components: shopComponents(rows, p, pages),
  };
}

/** Prev/Next. Custom id is `shop:page:<n>`. */
export async function handlePageButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const page = Number(interaction.customId.split(":")[2] ?? 0);
  const [config, economy] = await Promise.all([
    shopConfig(interaction.guildId),
    economyConfig(interaction.guildId),
  ]);

  const payload = await renderShop(
    interaction.guildId,
    interaction.guild.name,
    interaction.user.id,
    config,
    economy,
    Number.isFinite(page) ? page : 0,
  );
  await interaction.update(payload);
}

/**
 * Buying from the select menu. Custom id is `shop:buy:<page>`.
 *
 * Deferred first: purchase does several queries plus a role grant, which can
 * easily outrun Discord's three-second reply window.
 */
export async function handleBuySelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const itemId = interaction.values[0];
  if (!itemId) return;

  await interaction.deferReply(ephemeral);

  const [config, economy] = await Promise.all([
    shopConfig(interaction.guildId),
    economyConfig(interaction.guildId),
  ]);

  const member = interaction.member as GuildMember;
  const result = await purchase(interaction.guildId, member, itemId, config);

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
      ? `Bought **${item.name}** for ${economy.currencySymbol} ${item.price}. Staff have been notified and will sort it out. Order id \`${purchaseId}\`.`
      : `Bought **${item.name}** for ${economy.currencySymbol} ${item.price}. Enjoy!`,
  });
}
