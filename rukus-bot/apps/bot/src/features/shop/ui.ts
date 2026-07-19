import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type StringSelectMenuOptionBuilder,
} from "discord.js";
import type { EconomyConfig, ShopItem } from "@rukus/shared";
import { SHOP_BUY_CID, SHOP_PAGE_CID } from "./service.js";

/** Items per page. Discord caps a select menu at 25; 5 keeps the embed readable. */
export const PAGE_SIZE = 5;

export interface ShopRow {
  item: ShopItem;
  /** null = unlimited stock. */
  left: number | null;
  affordable: boolean;
}

const KIND_LABELS: Record<ShopItem["kind"], string> = {
  role: "Role",
  xpboost: "XP boost",
  contest_entry: "Contest entries",
  giveaway_entry: "Giveaway entries",
  custom: "Custom",
};

/** What the buyer actually gets, in one line. */
function effectLine(item: ShopItem): string {
  switch (item.kind) {
    case "role":
      return item.roleDurationHours > 0
        ? `<@&${item.roleId ?? ""}> for ${item.roleDurationHours}h`
        : `<@&${item.roleId ?? ""}>`;
    case "xpboost":
      return `${item.boostMultiplier}x XP for ${item.boostHours}h`;
    case "contest_entry":
      return `+${item.extraEntries} contest entry/entries`;
    case "giveaway_entry":
      return `+${item.extraEntries} giveaway entry/entries`;
    case "custom":
      return "Fulfilled by staff";
  }
}

export function totalPages(itemCount: number): number {
  return Math.max(1, Math.ceil(itemCount / PAGE_SIZE));
}

export function shopEmbed(
  rows: ShopRow[],
  page: number,
  pages: number,
  economy: EconomyConfig,
  balance: bigint,
  guildName: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🛒 ${guildName} shop`)
    .setColor(0x5865f2)
    .setFooter({
      text: `Page ${page + 1} of ${pages} • Your balance: ${balance} ${economy.currencyName}`,
    });

  if (rows.length === 0) {
    embed.setDescription("There's nothing for sale yet.");
    return embed;
  }

  for (const { item, left, affordable } of rows) {
    // The marker answers "can I buy this?" at a glance, which is the question
    // someone opening a shop is actually asking.
    const marker = !affordable ? "🔒" : left === 0 ? "❌" : "✅";
    const stock =
      left === null ? "" : left === 0 ? " • **sold out**" : ` • ${left} left`;
    embed.addFields({
      name: `${marker} ${item.name} - ${economy.currencySymbol} ${item.price}`,
      value: [
        item.description || null,
        `*${KIND_LABELS[item.kind]}: ${effectLine(item)}*${stock}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
  return embed;
}

/**
 * A select menu to buy from, plus prev/next when there is more than one page.
 *
 * Sold-out and unaffordable items stay listed but are absent from the menu:
 * showing them is informative, letting someone pick one is just a failed
 * purchase they could have been spared.
 */
export function shopComponents(
  rows: ShopRow[],
  page: number,
  pages: number,
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const out: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  const buyable = rows.filter((r) => r.affordable && r.left !== 0);
  if (buyable.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${SHOP_BUY_CID}:${page}`)
      .setPlaceholder("Buy an item...")
      .addOptions(
        buyable.map((r) => ({
          label: r.item.name.slice(0, 100),
          description: `${r.item.price}`.slice(0, 100),
          value: r.item.id,
        })) as unknown as StringSelectMenuOptionBuilder[],
      );
    out.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    );
  }

  if (pages > 1) {
    out.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${SHOP_PAGE_CID}:${page - 1}`)
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 0),
        new ButtonBuilder()
          .setCustomId(`${SHOP_PAGE_CID}:${page + 1}`)
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= pages - 1),
      ),
    );
  }
  return out;
}

/** Human-readable reason a purchase was rejected. */
export function failureMessage(
  reason: string,
  economy: EconomyConfig,
  item?: ShopItem,
): string {
  switch (reason) {
    case "disabled":
      return "The shop isn't enabled on this server.";
    case "unknown_item":
      return "I couldn't find that item. Check `/shop` for what's on sale.";
    case "item_disabled":
      return "That item isn't for sale right now.";
    case "out_of_stock":
      return "That item is sold out.";
    case "limit_reached":
      return `You've already bought the maximum of **${item?.name ?? "that item"}**.`;
    case "missing_role":
      return "You don't have the role needed to buy that.";
    case "insufficient_funds":
      return `You can't afford that. It costs ${economy.currencySymbol} ${item?.price ?? 0} ${economy.currencyName}.`;
    case "role_unavailable":
      return "I can't hand out that role. Ask an admin to check my Manage Roles permission and that my role sits above it.";
    case "grant_failed":
      return "Something went wrong applying that purchase, so you have not been charged.";
    default:
      return "That purchase didn't go through.";
  }
}
