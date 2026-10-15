"use server";

import { revalidatePath } from "next/cache";
import { BUILD_A_HOUSE_GUILD_ID, buildAHouseConfigSchema, buildAHouseSubmissionPanel } from "@rukus/shared";
import { getBuildAHouseConfig, setBuildAHouseConfig, requestBuildAHouseLeaderboardRefresh, resetBuildAHouseSubmissionLimits, allowBuildAHouseCardReplacement } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { loadGuildOptions } from "@/lib/guildOptions";
import { editChannelMessageStatus, postChannelMessage } from "@/lib/discord";

export async function saveLeaderboardSettings(guildId: string, payload: unknown) {
  await requireGuildAccess(guildId);
  if (guildId !== BUILD_A_HOUSE_GUILD_ID) return { ok: false, error: "This feature is not available for this server." };
  const parsed = buildAHouseConfigSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Choose valid channels." };
  const { submissionChannelId, leaderboardChannelId } = parsed.data;
  if (submissionChannelId && submissionChannelId === leaderboardChannelId) return { ok: false, error: "Choose separate submission and leaderboard channels." };
  const { channels } = await loadGuildOptions(guildId);
  for (const id of [submissionChannelId, leaderboardChannelId]) {
    if (id && !channels.some((channel) => channel.id === id)) return { ok: false, error: "Choose text channels in this server." };
  }
  try {
    const current = await getBuildAHouseConfig(guildId);
    await setBuildAHouseConfig(guildId, { ...current, submissionChannelId, leaderboardChannelId });
  } catch { return { ok: false, error: "Couldn't save the channels. Please try again." }; }
  revalidatePath(`/dashboard/${guildId}/build-a-house`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}

export async function publishSubmissionPanel(guildId: string) {
  await requireGuildAccess(guildId);
  if (guildId !== BUILD_A_HOUSE_GUILD_ID) return { ok: false, error: "This feature is not available for this server." };
  try {
    const current = await getBuildAHouseConfig(guildId);
    const channelId = current.submissionChannelId;
    const { channels } = await loadGuildOptions(guildId);
    if (!channelId || !channels.some((channel) => channel.id === channelId)) return { ok: false, error: "Save a submission channel first." };
    const payload = buildAHouseSubmissionPanel();
    if (current.panelChannelId === channelId && current.panelMessageId) {
      const edited = await editChannelMessageStatus(channelId, current.panelMessageId, payload);
      if (edited.ok) return { ok: true };
      if (!edited.missing) return { ok: false, error: "Couldn't update the existing panel. Check bot permissions." };
    }
    const posted = await postChannelMessage(channelId, payload);
    if (!posted.ok) return posted;
    await setBuildAHouseConfig(guildId, { ...current, panelChannelId: channelId, panelMessageId: posted.messageId });
    revalidatePath(`/dashboard/${guildId}/build-a-house`);
    return { ok: true };
  } catch { return { ok: false, error: "Couldn't publish the submission panel. Please try again." }; }
}


export async function refreshLeaderboardNow(guildId: string) {
  await requireGuildAccess(guildId);
  if (guildId !== BUILD_A_HOUSE_GUILD_ID) return { ok: false, error: "This feature is not available for this server." };
  try {
    const config = await getBuildAHouseConfig(guildId);
    const channelId = config.leaderboardChannelId;
    const { channels } = await loadGuildOptions(guildId);
    if (!channelId || !channels.some((channel) => channel.id === channelId)) {
      return { ok: false, error: "Save a leaderboard channel first." };
    }
    await requestBuildAHouseLeaderboardRefresh(guildId, channelId);
    return { ok: true };
  } catch { return { ok: false, error: "Couldn't request a refresh. Please try again." }; }
}


export async function resetEveryoneSubmissionLimit(guildId: string) {
  await requireGuildAccess(guildId);
  if (guildId !== BUILD_A_HOUSE_GUILD_ID) return { ok: false, error: "This feature is not available for this server." };
  try {
    await resetBuildAHouseSubmissionLimits(guildId);
    return { ok: true };
  } catch { return { ok: false, error: "Couldn't reset submission limits. Please try again." }; }
}


export async function replaceMyLinkedCard(guildId: string) {
  const { session } = await requireGuildAccess(guildId);
  if (guildId !== BUILD_A_HOUSE_GUILD_ID) return { ok: false, error: "This feature is not available for this server." };
  try {
    const allowed = await allowBuildAHouseCardReplacement(guildId, session.discordId!);
    if (!allowed) return { ok: false, error: "Your signed-in Discord account has no linked card. Submit a card normally." };
    return { ok: true };
  } catch { return { ok: false, error: "Couldn't allow card replacement. Please try again." }; }
}
