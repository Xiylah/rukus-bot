"use server";

import { revalidatePath } from "next/cache";
import { BUILD_A_HOUSE_GUILD_ID, buildAHouseConfigSchema } from "@rukus/shared";
import { setBuildAHouseConfig } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { loadGuildOptions } from "@/lib/guildOptions";

export async function saveLeaderboardSettings(guildId: string, payload: unknown) {
  await requireGuildAccess(guildId);
  if (guildId !== BUILD_A_HOUSE_GUILD_ID) return { ok: false, error: "This feature is not available for this server." };
  const parsed = buildAHouseConfigSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Choose a valid submission channel." };
  if (parsed.data.submissionChannelId) {
    const { channels } = await loadGuildOptions(guildId);
    if (!channels.some((channel) => channel.id === parsed.data.submissionChannelId)) {
      return { ok: false, error: "Choose a text channel in this server." };
    }
  }
  try {
    await setBuildAHouseConfig(guildId, parsed.data);
  } catch {
    return { ok: false, error: "Couldn't save the channel. Please try again." };
  }
  revalidatePath(`/dashboard/${guildId}/build-a-house`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}
