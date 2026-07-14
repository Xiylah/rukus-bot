"use server";

import { revalidatePath } from "next/cache";
import { setLoggingConfig } from "@rukus/supabase";
import { loggingConfigSchema } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Logging's save action lives beside its page rather than in the shared
 * actions.ts. It behaves identically: re-check guild access (never trust the
 * guildId a client sends), then validate with the SAME Zod schema the bot
 * reads with, so a malformed submission is rejected here and not in the bot.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveLoggingConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = loggingConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }
  await setLoggingConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/logging`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}
