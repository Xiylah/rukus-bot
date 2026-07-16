"use server";

import { revalidatePath } from "next/cache";
import { setRaidConfig } from "@rukus/supabase";
import { raidConfigSchema } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Server action for raid protection settings. Lives next to the page so the raid
 * feature ships without editing the shared actions.ts.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveRaidConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = raidConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }
  await setRaidConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/raid`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}
