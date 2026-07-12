"use server";

import { revalidatePath } from "next/cache";
import {
  getTicketConfig,
  getFormsConfig,
  setTicketConfig,
  setFormsConfig,
  setTranslationConfig,
  setAutoResponderConfig,
  setModerationConfig,
  setWelcomeConfig,
  setCustomCommandsConfig,
  setAccessConfig,
} from "@rukus/supabase";
import {
  ticketConfigSchema,
  formsConfigSchema,
  translationConfigSchema,
  autoResponderConfigSchema,
  moderationConfigSchema,
  welcomeConfigSchema,
  customCommandsConfigSchema,
  accessConfigSchema,
  buildTicketPanelPayload,
  buildFormsPanelPayload,
} from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";
import { postChannelMessage, editChannelMessage } from "@/lib/discord";
import { getSupabase } from "@rukus/supabase";

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
  // Panel tracking (where the live panel message lives) is owned by the
  // publish action, not the settings form; preserve it across saves so a
  // stale client state can't orphan the posted panel.
  const currentTickets = await getTicketConfig(guildId);
  parsed.data.panelChannelId = currentTickets.panelChannelId;
  parsed.data.panelMessageId = currentTickets.panelMessageId;
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
  // Same as tickets: the publish action owns the panel tracking fields.
  const currentForms = await getFormsConfig(guildId);
  parsed.data.panelChannelId = currentForms.panelChannelId;
  parsed.data.panelMessageId = currentForms.panelMessageId;
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

export async function saveCustomCommandsConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = customCommandsConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }
  await setCustomCommandsConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/commands`);
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

/**
 * Publish (or update in place) a panel message in Discord from the dashboard.
 * If we previously posted this panel to the SAME channel, we edit that message
 * so the server doesn't accumulate duplicates; otherwise we post fresh and
 * remember where it lives.
 */
async function publishPanel(
  guildId: string,
  channelId: string,
  kind: "tickets" | "forms",
): Promise<ActionResult & { updated?: boolean }> {
  await requireGuildAccess(guildId);
  if (!/^\d{17,20}$/.test(channelId)) {
    return { ok: false, error: "Pick a channel first." };
  }

  const config =
    kind === "tickets" ? await getTicketConfig(guildId) : await getFormsConfig(guildId);
  const payload =
    kind === "tickets"
      ? buildTicketPanelPayload(config as never)
      : buildFormsPanelPayload(config as never);

  // Same channel as last time: try an in-place edit first.
  if (config.panelMessageId && config.panelChannelId === channelId) {
    const edited = await editChannelMessage(channelId, config.panelMessageId, payload);
    if (edited) {
      revalidatePath(`/dashboard/${guildId}/${kind}`);
      return { ok: true, updated: true };
    }
    // Message was deleted; fall through and post a new one.
  }

  const posted = await postChannelMessage(channelId, payload);
  if (!posted.ok) return { ok: false, error: posted.error };

  const next = {
    ...config,
    panelChannelId: channelId,
    panelMessageId: posted.messageId,
  };
  if (kind === "tickets") await setTicketConfig(guildId, next);
  else await setFormsConfig(guildId, next);

  revalidatePath(`/dashboard/${guildId}/${kind}`);
  return { ok: true, updated: false };
}

export async function publishTicketPanel(guildId: string, channelId: string) {
  return publishPanel(guildId, channelId, "tickets");
}

export async function publishFormsPanel(guildId: string, channelId: string) {
  return publishPanel(guildId, channelId, "forms");
}

/**
 * Delete moderation cases from the dashboard. Administrator-only: removing
 * records is more sensitive than creating them, and a staff member should not
 * be able to erase their own history.
 */
export async function deleteCases(
  guildId: string,
  numbers: number[],
): Promise<ActionResult> {
  const { guild } = await requireGuildAccess(guildId);
  const { isGuildAdmin } = await import("@/lib/discord");
  if (!isGuildAdmin(guild)) {
    return { ok: false, error: "Only server Administrators can delete cases." };
  }
  if (numbers.length === 0) return { ok: false, error: "Nothing selected." };

  const { error } = await getSupabase()
    .from("ModCase")
    .delete()
    .eq("guildId", guildId)
    .in("number", numbers);

  if (error) return { ok: false, error: `Delete failed: ${error.message}` };

  revalidatePath(`/dashboard/${guildId}/cases`);
  return { ok: true };
}
