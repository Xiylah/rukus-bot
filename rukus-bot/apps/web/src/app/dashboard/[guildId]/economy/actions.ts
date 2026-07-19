"use server";

import { revalidatePath } from "next/cache";
import { setEconomyConfig } from "@rukus/supabase";
import { economyConfigSchema } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Route-local server action for the economy settings form.
 *
 * Same contract as the shared actions.ts: re-check guild access (a server
 * action is a callable endpoint, so the page guard is not enough) and validate
 * with the very schema the bot reads back.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveEconomyConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = economyConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }

  // The schema bounds these independently but does not cross-validate them, so
  // a min above a max would parse here and only surface as a nonsense payout
  // range in the bot. Caught at the door instead.
  if (parsed.data.perMessageMin > parsed.data.perMessageMax) {
    return {
      ok: false,
      error: "Minimum per message cannot be above the maximum.",
    };
  }

  await setEconomyConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/economy`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}
