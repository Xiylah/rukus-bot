"use server";

import { revalidatePath } from "next/cache";
import { setBirthdaysConfig } from "@rukus/supabase";
import { birthdaysConfigSchema } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Route-local server action for the birthdays form.
 *
 * Same contract as every other one: re-check guild access (a server action is a
 * callable endpoint, so the page guard alone is not enough) and validate with
 * the very schema the bot reads back.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveBirthdaysConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = birthdaysConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }

  // The bot formats the guild's local date with Intl, which throws on a zone it
  // does not know. Catching it here means a typo is a form error, not a sweeper
  // that quietly falls back to UTC and announces at the wrong hour.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    return {
      ok: false,
      error: `"${parsed.data.timezone}" is not a timezone I recognise. Use an IANA name like Europe/London.`,
    };
  }

  await setBirthdaysConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/birthdays`);
  return { ok: true };
}
