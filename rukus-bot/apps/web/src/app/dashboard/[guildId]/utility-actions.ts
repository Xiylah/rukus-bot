"use server";

import { revalidatePath } from "next/cache";
import {
  getSupabase,
  setAutoRolesConfig,
  setRemindersConfig,
  setHighlightsConfig,
  setUtilityConfig,
  setAfkConfig,
} from "@rukus/supabase";
import {
  autoRolesConfigSchema,
  remindersConfigSchema,
  highlightsConfigSchema,
  utilityConfigSchema,
  afkConfigSchema,
} from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Server actions for the utility cluster (auto-roles, reminders, highlights,
 * the embed builder toggle).
 *
 * These live here rather than in the page-shared actions.ts so this feature can
 * be added without touching a file every other feature also writes to. Same
 * contract as the shared one: re-check guild access (never trust the client's
 * guildId) and validate with the SAME Zod schema the bot reads with.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveAutoRolesConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = autoRolesConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setAutoRolesConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/autoroles`);
  return { ok: true };
}

export async function saveRemindersConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = remindersConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setRemindersConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/reminders`);
  return { ok: true };
}

export async function saveHighlightsConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = highlightsConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setHighlightsConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/highlights`);
  return { ok: true };
}

export async function saveUtilityConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = utilityConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setUtilityConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/utility`);
  return { ok: true };
}

export async function saveAfkConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = afkConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setAfkConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/utility`);
  return { ok: true };
}

/** Cancel someone's reminder from the dashboard (staff clearing a stuck timer). */
export async function deleteReminder(
  guildId: string,
  id: string,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);

  // Scope the delete by guildId as well as id: the id comes from the client,
  // and without the guild filter a staff member of one server could delete a
  // reminder belonging to another.
  const { error } = await getSupabase()
    .from("Reminder")
    .delete()
    .eq("guildId", guildId)
    .eq("id", id);

  if (error) return { ok: false, error: `Delete failed: ${error.message}` };
  revalidatePath(`/dashboard/${guildId}/reminders`);
  return { ok: true };
}
