import { EmbedBuilder, escapeMarkdown, type Client } from "discord.js";
import { prisma, Prisma } from "@rukus/db";
import { BUILD_A_HOUSE_GUILD_ID, buildAHouseConfigSchema, leaderboardWeek } from "@rukus/shared";
import { leaderboardMetrics, formatLeaderboardValue, type LeaderboardMetric } from "./settings.js";
import { log } from "../../lib/logger.js";

export function weeklyEmbed(metric: LeaderboardMetric, rows: { fortniteDisplayName: string; userId: string; collection: number; homeValue: bigint; playtimeSeconds: bigint; goldBalance: bigint }[], now: Date) {
  return new EmbedBuilder().setTitle(`Build A House Leaderboard • ${leaderboardMetrics[metric]}`)
    .setColor(0x81947a).setTimestamp(now)
    .setDescription(rows.length ? rows.map((row, index) =>
      `**${index + 1}.** ${escapeMarkdown(row.fortniteDisplayName.replace(/[\r\n]/g, " ").slice(0, 32))} — **${formatLeaderboardValue(metric, row[metric])}**`
    ).join("\n") : "No stat cards submitted yet.")
    .setFooter({ text: "Top 10 • Latest submitted stats • Refreshes Sunday, midnight America/Chicago" });
}

export async function refreshWeeklyLeaderboard(client: Client) {
  await prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(700382994946588814::bigint) AS locked`;
    if (!lock[0]?.locked) return;
    const row = await tx.featureConfig.findUnique({ where: { guildId_feature: { guildId: BUILD_A_HOUSE_GUILD_ID, feature: "buildahouse" } } });
    const config = buildAHouseConfigSchema.parse(row?.config ?? {});
    if (!config.leaderboardChannelId) return;
    const stateKey = { guildId: BUILD_A_HOUSE_GUILD_ID, feature: "buildahouse-weekly-state" };
    const stored = await tx.featureConfig.findUnique({ where: { guildId_feature: stateKey } });
    const state = (stored?.config ?? {}) as { channelId?: string; messageId?: string; week?: string; handledRequestId?: string };
    const requestRow = await tx.featureConfig.findUnique({ where: { guildId_feature: {
      guildId: BUILD_A_HOUSE_GUILD_ID, feature: "buildahouse-refresh-request",
    } } });
    const request = (requestRow?.config ?? {}) as { requestId?: string; channelId?: string };
    const requestId = typeof request.requestId === "string" && request.requestId && request.channelId === config.leaderboardChannelId
      ? request.requestId : undefined;
    const manualRefresh = requestId && requestId !== state.handledRequestId;
    const now = new Date();
    const week = leaderboardWeek(now);
    if (state.channelId === config.leaderboardChannelId && state.week === week && !manualRefresh) return;
    const channel = await client.channels.fetch(config.leaderboardChannelId);
    if (!channel?.isSendable() || !("guildId" in channel) || channel.guildId !== BUILD_A_HOUSE_GUILD_ID) throw new Error("Invalid Build A House leaderboard channel");
    const embeds = [];
    for (const metric of Object.keys(leaderboardMetrics) as LeaderboardMetric[]) {
      const rows = await tx.buildAHouseStats.findMany({ where: { guildId: BUILD_A_HOUSE_GUILD_ID },
        orderBy: [{ [metric]: "desc" }, { userId: "asc" }], take: 10 });
      embeds.push(weeklyEmbed(metric, rows, now));
    }
    const payload = { embeds, allowedMentions: { parse: [] as never[] } };
    let messageId: string | undefined;
    if (state.channelId === channel.id && state.messageId) {
      try {
        const message = await channel.messages.fetch(state.messageId);
        await message.edit(payload); messageId = message.id;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === 10008)) throw error;
      }
    }
    if (!messageId) messageId = (await channel.send(payload)).id;
    const next = { channelId: channel.id, messageId, week, ...(requestId ? { handledRequestId: requestId } : state.handledRequestId ? { handledRequestId: state.handledRequestId } : {}) };
    await tx.featureConfig.upsert({ where: { guildId_feature: stateKey }, create: { ...stateKey, config: next }, update: { config: next } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 45000, maxWait: 5000 });
}

export function startBuildAHouseWeekly(client: Client) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await refreshWeeklyLeaderboard(client); }
    catch (error) { log.warn("Build A House weekly leaderboard refresh failed", error); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
}
