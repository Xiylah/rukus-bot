import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
} from "discord.js";
import { COLORS, type EconomyConfig } from "@rukus/shared";
import type { TopRow } from "./service.js";

/** Custom-id prefix for the richest list's pager buttons. */
export const RICH_CID = "eco:rich";

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * Format an amount the way this guild names its money.
 *
 * Every user-facing number goes through here, so a server that renamed coins to
 * "gems" never sees the word "coins" leak out of one command that forgot.
 */
export function money(config: EconomyConfig, amount: bigint | number): string {
  return `${config.currencySymbol} **${amount.toLocaleString()}**`;
}

/** The plain name, for sentences like "you have no coins". */
export function currency(config: EconomyConfig, amount: bigint | number): string {
  return `${amount.toLocaleString()} ${config.currencyName}`;
}

/** One page of the richest list. */
export function richestEmbed(
  guild: Guild,
  config: EconomyConfig,
  rows: TopRow[],
  page: number,
  pages: number,
  total: number,
  perPage = 10,
): EmbedBuilder {
  const lines = rows.map((r, i) => {
    const place = (page - 1) * perPage + i + 1;
    const badge = MEDALS[place - 1] ?? `\`#${String(place).padStart(2, " ")}\``;
    // A mention renders even when the member has left, which a cached username
    // would not; the list should not go blank because someone left.
    return `${badge} <@${r.userId}> - ${money(config, r.amount)}`;
  });

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${config.currencySymbol} Richest in ${guild.name}`)
    .setDescription(
      lines.join("\n") || `Nobody has earned any ${config.currencyName} yet.`,
    )
    .setFooter({ text: `Page ${page} of ${pages} · ${total} ranked members` });
}

/** Prev/Next pager. The page is carried in the custom id, so it is stateless. */
export function richestButtons(
  page: number,
  pages: number,
  ownerId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${RICH_CID}:${ownerId}:${page - 1}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${RICH_CID}:${ownerId}:${page + 1}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages),
  );
}
