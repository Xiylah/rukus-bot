"use server";

import { revalidatePath } from "next/cache";
import { setInviteTrackerConfig } from "@rukus/supabase";
import { inviteTrackerConfigSchema } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/** Route-local server action for the invite tracker form. */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveInviteTrackerConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = inviteTrackerConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }

  await setInviteTrackerConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/invites`);
  return { ok: true };
}
