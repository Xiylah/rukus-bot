"use server";

import { revalidatePath } from "next/cache";
import { setTempVoiceConfig } from "@rukus/supabase";
import { tempVoiceConfigSchema } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/** Route-local server action for the temp voice form. */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveTempVoiceConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = tempVoiceConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }

  // Turning it on without a lobby is the one misconfiguration that looks like a
  // broken bot: nothing to join, so nothing ever happens, and no error anywhere.
  if (parsed.data.enabled && !parsed.data.lobbyChannelId) {
    return {
      ok: false,
      error: "Pick the voice channel members join to create their own.",
    };
  }

  await setTempVoiceConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/tempvoice`);
  return { ok: true };
}
