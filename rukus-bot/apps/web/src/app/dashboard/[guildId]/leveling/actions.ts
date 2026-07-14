"use server";

import { revalidatePath } from "next/cache";
import { setLevelingConfig } from "@rukus/supabase";
import { levelingConfigSchema } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Route-local server action for the leveling settings form.
 *
 * Same contract as the shared actions.ts: re-check guild access (a server
 * action is a callable endpoint, so the page guard is not enough) and validate
 * with the very schema the bot reads back.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveLevelingConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = levelingConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }

  if (parsed.data.xpPerMessageMin > parsed.data.xpPerMessageMax) {
    return { ok: false, error: "Minimum XP cannot be above maximum XP." };
  }

  await setLevelingConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/leveling`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}
