"use server";

import { revalidatePath } from "next/cache";
import { getSocialAlertsConfig, setSocialAlertsConfig } from "@rukus/supabase";
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
  // lastItemId is owned by the poller, not the form. The form sends back the
  // value from when the page LOADED, so saving after the bot announced a new
  // video reverted it, and the next poll announced that video again (pings
  // included). Keep the stored value per feed. If the feed now points at a
  // different source, reset it to "" so the first poll seeds the new source's
  // latest item silently instead of announcing it.
  const current = await getSocialAlertsConfig(guildId);
  const stored = new Map(current.feeds.map((f) => [f.id, f]));
  parsed.data.feeds = parsed.data.feeds.map((f) => {
    const prev = stored.get(f.id);
    if (!prev) return { ...f, lastItemId: "" };
    const sameSource = prev.type === f.type && prev.source === f.source;
    return { ...f, lastItemId: sameSource ? prev.lastItemId : "" };
  });

  await setSocialAlertsConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/social`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}
