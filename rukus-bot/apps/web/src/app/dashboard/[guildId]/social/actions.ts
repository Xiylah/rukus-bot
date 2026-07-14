"use server";

import { revalidatePath } from "next/cache";
import { setSocialAlertsConfig } from "@rukus/supabase";
import { socialAlertsConfigSchema } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Persist the social-alerts config.
 *
 * Same contract as the shared actions.ts: re-check guild access server-side
 * (never trust the guildId the client sent) and validate with the exact schema
 * the bot reads with, so a malformed feed cannot reach the poller.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveSocialAlertsConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = socialAlertsConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  await setSocialAlertsConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/social`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}
