"use server";

import { revalidatePath } from "next/cache";
import { getReactionRolesConfig, setReactionRolesConfig } from "@rukus/supabase";
import {
  buildReactionRolePanelPayload,
  reactionEmojiFor,
  reactionRolesConfigSchema,
} from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";
import { postChannelMessage, editChannelMessage } from "@/lib/discord";
import { fetchGuildRoles } from "@/lib/discord";

/**
 * Server actions for self-role panels.
 *
 * These live next to the page rather than in the shared actions.ts because the
 * publish step needs something the other panels don't: after posting, a
 * "reactions" style panel has to have its emoji actually reacted onto the
 * message, which is a separate REST route.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveReactionRolesConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = reactionRolesConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }

  // messageId is owned by the publish action. A form that was opened before the
  // last publish would otherwise send back a stale null and orphan the live
  // panel message, so carry the stored value across every save.
  const current = await getReactionRolesConfig(guildId);
  const posted = new Map(current.panels.map((p) => [p.id, p.messageId]));
  parsed.data.panels = parsed.data.panels.map((p) => ({
    ...p,
    messageId: posted.get(p.id) ?? null,
  }));

  await setReactionRolesConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/reactionroles`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}

const DISCORD_API = "https://discord.com/api/v10";

/**
 * React to a freshly posted panel with each of its emoji. Only "reactions"
 * style panels need this; the emoji IS the button there.
 */
async function addPanelReactions(
  channelId: string,
  messageId: string,
  emojis: string[],
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;
  for (const emoji of emojis) {
    const api = reactionEmojiFor(emoji);
    if (!api) continue;
    await fetch(
      `${DISCORD_API}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(api)}/@me`,
      { method: "PUT", headers: { Authorization: `Bot ${token}` } },
    ).catch(() => {});
  }
}

/**
 * Post a panel to its channel, or edit the live message in place when it is
 * still there, so re-publishing never litters the channel with duplicates.
 */
export async function publishReactionRolePanel(
  guildId: string,
  panelId: string,
): Promise<ActionResult & { updated?: boolean }> {
  await requireGuildAccess(guildId);

  const config = await getReactionRolesConfig(guildId);
  const panel = config.panels.find((p) => p.id === panelId);
  if (!panel) return { ok: false, error: "That panel no longer exists. Save first." };
  if (!panel.channelId) return { ok: false, error: "Pick a channel for this panel first." };
  if (panel.pairs.length === 0) {
    return { ok: false, error: "Add at least one emoji/role pair first." };
  }

  // The bot labels unlabelled buttons with the role's name; feed the builder the
  // same names so both sides produce the identical message.
  const roles = await fetchGuildRoles(guildId);
  const names: Record<string, string> = {};
  for (const r of roles) names[r.id] = r.name;

  const payload = buildReactionRolePanelPayload(panel, names);
  const emojis = panel.style === "reactions" ? panel.pairs.map((p) => p.emoji) : [];

  if (panel.messageId) {
    const edited = await editChannelMessage(panel.channelId, panel.messageId, payload);
    if (edited) {
      await addPanelReactions(panel.channelId, panel.messageId, emojis);
      revalidatePath(`/dashboard/${guildId}/reactionroles`);
      return { ok: true, updated: true };
    }
    // The message was deleted; fall through and post a fresh one.
  }

  const posted = await postChannelMessage(panel.channelId, payload);
  if (!posted.ok) return { ok: false, error: posted.error };

  await addPanelReactions(panel.channelId, posted.messageId, emojis);

  await setReactionRolesConfig(guildId, {
    ...config,
    panels: config.panels.map((p) =>
      p.id === panelId ? { ...p, messageId: posted.messageId } : p,
    ),
  });

  revalidatePath(`/dashboard/${guildId}/reactionroles`);
  return { ok: true, updated: false };
}
