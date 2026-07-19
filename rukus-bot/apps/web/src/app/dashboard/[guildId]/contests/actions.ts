"use server";

import { revalidatePath } from "next/cache";
import { setContestsConfig, deleteContestEntry } from "@rukus/supabase";
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

/**
 * Disqualify an entry so it cannot win.
 *
 * Deletes the ContestEntry row only. The member's message stays up: taking down
 * someone's post is a moderation call, and a staff member who wants that can do
 * it in Discord where it is logged as such.
 */
export async function disqualifyEntry(
  guildId: string,
  entryId: string,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const result = await deleteContestEntry(guildId, entryId);
  if (!result.ok) {
    return { ok: false, error: `Could not disqualify: ${result.error}` };
  }
  revalidatePath(`/dashboard/${guildId}/contests`);
  return { ok: true };
}
