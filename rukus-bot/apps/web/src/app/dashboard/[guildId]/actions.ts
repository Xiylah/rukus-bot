"use server";

import { revalidatePath } from "next/cache";
import {
  setTicketConfig,
  setFormsConfig,
  setTranslationConfig,
  setAutoResponderConfig,
  setModerationConfig,
  setWelcomeConfig,
  setAccessConfig,
} from "@rukus/supabase";
import {
  ticketConfigSchema,
  formsConfigSchema,
  translationConfigSchema,
  autoResponderConfigSchema,
  moderationConfigSchema,
  welcomeConfigSchema,
  accessConfigSchema,
} from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Server actions that persist dashboard config.
 *
 * Every action re-checks guild access via requireGuildAccess - never trust the
 * guildId from the client alone. Payloads are validated with the same Zod
 * schemas the bot reads with, so a malformed submission is rejected here.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveTicketConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = ticketConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setTicketConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/tickets`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}

export async function saveFormsConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = formsConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setFormsConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/forms`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}

export async function saveTranslationConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = translationConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setTranslationConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/translation`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}

export async function saveAutoResponderConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = autoResponderConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setAutoResponderConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/autoresponder`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}

export async function saveModerationConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = moderationConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setModerationConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/moderation`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}

export async function saveWelcomeConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = welcomeConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setWelcomeConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/welcome`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}

export async function saveAccessConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  // ADMINISTRATOR-only. Granting dashboard access is effectively granting power
  // over every other setting, so staff-role users must not be able to escalate.
  //
  // This check is the real security boundary - the page-level redirect is only
  // UI. A server action is a callable endpoint, so it must re-verify on its own.
  const { guild } = await requireGuildAccess(guildId);
  const { isGuildAdmin } = await import("@/lib/discord");
  if (!isGuildAdmin(guild)) {
    return {
      ok: false,
      error: "Only server Administrators can change access settings.",
    };
  }
  const parsed = accessConfigSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await setAccessConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/access`);
  return { ok: true };
}
