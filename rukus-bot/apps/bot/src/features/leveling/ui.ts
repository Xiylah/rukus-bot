import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type User,
} from "discord.js";
import { COLORS, levelProgress, progressBar } from "@rukus/shared";
import type { RankRow } from "./service.js";

/** Custom-id prefix for the leaderboard's pager buttons. */
export const LB_CID = "lvl:lb";

const MEDALS = ["🥇", "🥈", "🥉"];

/** The /rank card: level, progress to the next level, and server position. */
export function rankEmbed(
  user: User,
  row: RankRow,
  rank: number,
  total: number,
  displayColor: number,
): EmbedBuilder {
  const p = levelProgress(row.xp);
  const pct = Math.round(p.ratio * 100);

  return new EmbedBuilder()
    .setColor(displayColor || COLORS.primary)
    .setAuthor({
      name: user.displayName || user.username,
      iconURL: user.displayAvatarURL({ size: 128 }),
    })
    .setDescription(
      `\`${progressBar(p.ratio)}\` **${pct}%**\n` +
        `${p.currentXp.toLocaleString()} / ${p.neededXp.toLocaleString()} XP to level ${p.level + 1}`,
    )
    .addFields(
      { name: "Level", value: `**${p.level}**`, inline: true },
      { name: "Total XP", value: row.xp.toLocaleString(), inline: true },
      { name: "Rank", value: `#${rank} of ${total}`, inline: true },
    )
    .setFooter({ text: `${row.messages.toLocaleString()} messages counted` });
}

/** One page of the leaderboard. Names come from the cache, ids from the DB. */
export function leaderboardEmbed(
  guild: Guild,
  rows: RankRow[],
  page: number,
  pages: number,
  total: number,
  perPage = 10,
): EmbedBuilder {
  const lines = rows.map((r, i) => {
    const place = (page - 1) * perPage + i + 1;
    const badge = MEDALS[place - 1] ?? `\`#${String(place).padStart(2, " ")}\``;
    // A mention renders even when the member has left, which a cached username
    // would not; the leaderboard should not go blank because someone left.
    return `${badge} <@${r.userId}> - level **${r.level}** (${r.xp.toLocaleString()} XP)`;
  });

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`🏆 ${guild.name} leaderboard`)
    .setDescription(lines.join("\n") || "Nobody has earned XP yet.")
    .setFooter({ text: `Page ${page} of ${pages} · ${total} ranked members` });
}

/** Prev/Next pager. The page is carried in the custom id, so it is stateless. */
export function leaderboardButtons(
  page: number,
  pages: number,
  ownerId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${LB_CID}:${ownerId}:${page - 1}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${LB_CID}:${ownerId}:${page + 1}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages),
  );
}
