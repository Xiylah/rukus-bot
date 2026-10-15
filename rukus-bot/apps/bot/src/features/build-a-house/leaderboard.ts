import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  escapeMarkdown,
  type ChatInputCommandInteraction,
} from "discord.js";
import { prisma, Prisma } from "@rukus/db";
import { log } from "../../lib/logger.js";
import {
  BUILD_A_HOUSE_GUILD_ID,
  BUILD_A_HOUSE_TITLE,
  formatLeaderboardValue,
  isBuildAHouseGuild,
  isLeaderboardMetric,
  leaderboardMetrics,
  type LeaderboardMetric,
} from "./settings.js";

const PER_PAGE = 10;

async function render(metric: LeaderboardMetric, requestedPage: number) {
  const result = await prisma.$transaction(async (tx) => {
    const total = await tx.buildAHouseStats.count({ where: { guildId: BUILD_A_HOUSE_GUILD_ID } });
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    const page = Math.min(Math.max(1, requestedPage), pages);
    const rows = await tx.buildAHouseStats.findMany({
      where: { guildId: BUILD_A_HOUSE_GUILD_ID },
      orderBy: [{ [metric]: "desc" }, { userId: "asc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    });
    return { total, pages, page, rows };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  const description = result.rows.length
    ? result.rows.map((row, index) => {
      const name = escapeMarkdown(row.fortniteDisplayName.replace(/[\r\n]/g, " ").slice(0, 64));
      const when = Math.floor(row.submittedAt.getTime() / 1000);
      return `**${(result.page - 1) * PER_PAGE + index + 1}.** ${name} — **${formatLeaderboardValue(metric, row[metric])}**\n<@${row.userId}> · Submitted <t:${when}:R>`;
    }).join("\n\n")
    : "No submitted Build A House stats yet.";

  const embed = new EmbedBuilder()
    .setTitle(BUILD_A_HOUSE_TITLE)
    .setColor(0x81947a)
    .setDescription(description)
    .setFooter({ text: `${leaderboardMetrics[metric]} • Page ${result.page}/${result.pages} • ${result.total} players • Screenshot submissions, not live stats` });

  const selector = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("bah:metric")
      .setPlaceholder("Choose a leaderboard")
      .addOptions(Object.entries(leaderboardMetrics).map(([value, label]) => ({ value, label, default: value === metric }))),
  );
  const pager = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("bah:previous").setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(result.page <= 1),
    new ButtonBuilder().setCustomId("bah:next").setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(result.page >= result.pages),
  );
  return { page: result.page, embeds: [embed], components: [selector, pager], allowedMentions: { parse: [] as const } };
}

export async function showBuildAHouseLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isBuildAHouseGuild(interaction.guildId)) return;
  await interaction.deferReply();
  let metric: LeaderboardMetric = "collection";
  let page = interaction.options.getInteger("page") ?? 1;
  let first;
  try {
    first = await render(metric, page);
  } catch (error) {
    log.error("Build A House leaderboard read failed", error);
    await interaction.editReply({ content: "Build A House Leaderboard is not ready yet. Please try again later." });
    return;
  }
  page = first.page;
  const message = await interaction.editReply({ embeds: first.embeds, components: first.components, allowedMentions: { parse: [] } });
  const collector = message.createMessageComponentCollector({ time: 5 * 60_000 });
  let busy = false;

  collector.on("collect", async (component) => {
    if (!component.customId.startsWith("bah:")) return;
    if (component.user.id !== interaction.user.id) {
      await component.reply({ content: "Run `/leaderboard` to open your own view.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (busy) {
      await component.deferUpdate();
      return;
    }
    busy = true;
    try {
      await component.deferUpdate();
      let nextMetric = metric;
      let nextPage = page;
      if (component.componentType === ComponentType.StringSelect) {
        const value = component.values[0];
        if (!value || !isLeaderboardMetric(value)) return;
        nextMetric = value;
        nextPage = 1;
      } else if (component.customId === "bah:previous") {
        nextPage -= 1;
      } else if (component.customId === "bah:next") {
        nextPage += 1;
      } else return;
      const next = await render(nextMetric, nextPage);
      if (collector.ended) return;
      await interaction.editReply({ embeds: next.embeds, components: next.components, allowedMentions: { parse: [] } });
      metric = nextMetric;
      page = next.page;
    } catch (error) {
      log.error("Build A House leaderboard update failed", error);
      await component.followUp({ content: "Couldn't refresh the leaderboard. Please try again.", flags: MessageFlags.Ephemeral }).catch(() => {});
    } finally {
      busy = false;
    }
  });
  collector.on("end", () => {
    void interaction.editReply({ components: [] }).catch(() => {});
  });
}
