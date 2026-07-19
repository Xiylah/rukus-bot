"use server";

import { revalidatePath } from "next/cache";
import { setShopConfig } from "@rukus/supabase";
import { shopConfigSchema } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Server action for the shop catalogue. Lives next to the page so the feature
 * ships without editing the shared actions.ts.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveShopConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = shopConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }
  await setShopConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/shop`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}
