import type {
  Guild,
  Message,
  MessageCreateOptions,
  MessageEditOptions,
  TextChannel,
} from "discord.js";
import {
  buildReactionRolePanelPayload,
  emojiKey,
  reactionEmojiFor,
  type ReactionRolePanel,
  type ReactionRolesConfig,
} from "@rukus/shared";
import { log } from "../../lib/logger.js";

/**
 * Posting and refreshing panel messages. The payload itself comes from the
 * SHARED builder, so /reactionroles post and the dashboard's "Post to Discord"
 * produce the identical message.
 */

export function findPanel(
  config: ReactionRolesConfig,
  idOrTitle: string,
): ReactionRolePanel | undefined {
  const needle = idOrTitle.trim().toLowerCase();
  return (
    config.panels.find((p) => p.id.toLowerCase() === needle) ??
    config.panels.find((p) => p.title.toLowerCase() === needle) ??
    config.panels.find((p) => p.title.toLowerCase().includes(needle))
  );
}

/** Role names let the shared builder label buttons that have no custom label. */
export function roleNames(guild: Guild): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of guild.roles.cache.values()) out[role.id] = role.name;
  return out;
}

export function panelMessage(
  panel: ReactionRolePanel,
  guild: Guild,
): MessageCreateOptions {
  return buildReactionRolePanelPayload(
    panel,
    roleNames(guild),
  ) as MessageCreateOptions;
}

/**
 * Make the message's reactions match the panel's pairs: add what's missing,
 * strip what the admin removed. Only meaningful for "reactions" style panels;
 * button/dropdown panels get their reactions cleared so a stale emoji from an
 * earlier style can't keep handing out roles.
 */
export async function syncReactions(
  message: Message,
  panel: ReactionRolePanel,
): Promise<void> {
  const wanted =
    panel.style === "reactions"
      ? panel.pairs
          .map((p) => reactionEmojiFor(p.emoji))
          .filter((e): e is string => e !== null)
      : [];
  const wantedKeys = new Set(wanted.map(emojiKey));

  for (const reaction of message.reactions.cache.values()) {
    const key = reaction.emoji.id ?? reaction.emoji.name ?? "";
    if (!wantedKeys.has(key)) {
      await reaction.remove().catch(() => {});
    }
  }

  for (const emoji of wanted) {
    try {
      await message.react(emoji);
    } catch (err) {
      // A custom emoji from another server, or a deleted one. Skip it rather
      // than abandoning the rest of the panel.
      log.warn(`Reaction roles: could not react with ${emoji}`, err);
    }
  }
}

/**
 * Post the panel, or edit the existing message when it is still there. Returns
 * the message id so the caller can persist it (that id is what makes
 * re-publishing an edit instead of a duplicate).
 */
export async function publishPanel(
  channel: TextChannel,
  panel: ReactionRolePanel,
): Promise<{ messageId: string; updated: boolean }> {
  const payload = panelMessage(panel, channel.guild);

  if (panel.messageId) {
    const existing = await channel.messages
      .fetch(panel.messageId)
      .catch(() => null);
    if (existing) {
      await existing.edit(payload as MessageEditOptions);
      await syncReactions(existing, panel);
      return { messageId: existing.id, updated: true };
    }
  }

  const sent = await channel.send(payload);
  await syncReactions(sent, panel);
  return { messageId: sent.id, updated: false };
}
