"use server";

import { revalidatePath } from "next/cache";
import { getEmbedsConfig, setEmbedsConfig } from "@rukus/supabase";
import {
  buildSavedEmbedPayload,
  embedsConfigSchema,
  savedEmbedIsPostable,
} from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";
import { postChannelMessage, editChannelMessage } from "@/lib/discord";

/**
 * Server actions for the embed builder.
 *
 * Next to the page rather than in the shared actions.ts because publishing is
 * not a config write: it posts to Discord and then has to store the resulting
 * message id, which no other settings page does.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveEmbedsConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = embedsConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }

  // messageId belongs to publish, not to the form. A tab opened before the last
  // publish would otherwise post back a stale null and orphan the live message,
  // so the stored value always wins over whatever the form sent.
  const current = await getEmbedsConfig(guildId);
  const posted = new Map(current.embeds.map((e) => [e.id, e.messageId]));
  parsed.data.embeds = parsed.data.embeds.map((e) => ({
    ...e,
    messageId: posted.get(e.id),
  }));

  await setEmbedsConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/embeds`);
  return { ok: true };
}

/**
 * Post an embed, or edit the live message in place when it still exists.
 *
 * Editing rather than reposting is the entire point of saving these: a rules or
 * info post accumulates reactions, a pin, and links pointing at it, and all of
 * that is lost the moment it is deleted and posted fresh.
 */
export async function publishEmbed(
  guildId: string,
  embedId: string,
): Promise<ActionResult & { updated?: boolean; messageId?: string }> {
  await requireGuildAccess(guildId);

  const config = await getEmbedsConfig(guildId);
  const embed = config.embeds.find((e) => e.id === embedId);
  if (!embed) return { ok: false, error: "That embed no longer exists. Save first." };
  if (!embed.channelId) return { ok: false, error: "Pick a channel first." };
  if (!savedEmbedIsPostable(embed)) {
    return {
      ok: false,
      error: "Add a title, description, image or message text before posting.",
    };
  }

  const payload = buildSavedEmbedPayload(embed);

  if (embed.messageId) {
    const edited = await editChannelMessage(embed.channelId, embed.messageId, payload);
    if (edited) {
      revalidatePath(`/dashboard/${guildId}/embeds`);
      return { ok: true, updated: true, messageId: embed.messageId };
    }
    // Falls through: the message was deleted, so post a fresh one below rather
    // than leaving the staff member stuck with a button that silently does
    // nothing.
  }

  const sent = await postChannelMessage(embed.channelId, payload);
  if (!sent.ok) return { ok: false, error: sent.error };

  await setEmbedsConfig(guildId, {
    ...config,
    embeds: config.embeds.map((e) =>
      e.id === embedId ? { ...e, messageId: sent.messageId } : e,
    ),
  });

  revalidatePath(`/dashboard/${guildId}/embeds`);
  return { ok: true, updated: false, messageId: sent.messageId };
}

/**
 * Forget the posted message without touching Discord.
 *
 * Deliberately does NOT delete the message: unlinking is how staff turn a
 * published embed back into a draft, or recover after posting to the wrong
 * channel. Deleting someone's message from a settings page is a bigger action
 * than it looks, and Discord already has a delete button.
 */
export async function unlinkEmbed(
  guildId: string,
  embedId: string,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const config = await getEmbedsConfig(guildId);
  await setEmbedsConfig(guildId, {
    ...config,
    embeds: config.embeds.map((e) =>
      e.id === embedId ? { ...e, messageId: undefined } : e,
    ),
  });
  revalidatePath(`/dashboard/${guildId}/embeds`);
  return { ok: true };
}
