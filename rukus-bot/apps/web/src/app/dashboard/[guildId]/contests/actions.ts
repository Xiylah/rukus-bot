"use server";

import { revalidatePath } from "next/cache";
import { setContestsConfig } from "@rukus/supabase";
import { contestsConfigSchema } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Server action for contest settings. Lives next to the page so the feature
 * ships without editing the shared actions.ts.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveContestsConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = contestsConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }
  await setContestsConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/contests`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}
