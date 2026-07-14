import type {
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";
import {
  decideReactionRole,
  pairForEmoji,
  type ReactionRolePanel,
} from "@rukus/shared";
import { reactionRolesConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import { applyDecision } from "./apply.js";

/**
 * The legacy Carl-style surface: reactions on a panel message.
 *
 * Panels are typically months old, so the message is never in the bot's cache.
 * discord.js delivers those as PARTIAL reactions (Partials.Reaction is enabled
 * in index.ts) - we only need reaction.message.id and the emoji, both of which
 * a partial already carries, so there is nothing to fetch on the hot path.
 */

/**
 * Reactions we removed ourselves (verify/binding/refusals). Discord echoes that
 * removal back as a MessageReactionRemove, which some modes would then act on:
 * suppress exactly one echo per removal.
 */
const selfRemoved = new Set<string>();
const SELF_REMOVED_MAX = 500;

function suppressKey(messageId: string, userId: string, emoji: string): string {
  return `${messageId}:${userId}:${emoji}`;
}

function markSelfRemoved(key: string): void {
  selfRemoved.add(key);
  while (selfRemoved.size > SELF_REMOVED_MAX) {
    const oldest = selfRemoved.values().next().value;
    if (oldest === undefined) break;
    selfRemoved.delete(oldest);
  }
}

export async function handleReactionEvent(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  event: "add" | "remove",
): Promise<void> {
  if (user.bot) return;
  const guildId = reaction.message.guildId;
  if (!guildId) return;

  const key = reaction.emoji.id ?? reaction.emoji.name ?? "";
  if (!key) return;

  const suppress = suppressKey(reaction.message.id, user.id, key);
  if (event === "remove" && selfRemoved.delete(suppress)) return;

  const config = await reactionRolesConfig(guildId);
  if (!config.enabled) return;

  // The message id is the panel's identity: no DB lookup, no message fetch.
  const panel: ReactionRolePanel | undefined = config.panels.find(
    (p) => p.messageId === reaction.message.id,
  );
  if (!panel || panel.style !== "reactions") return;

  const pair = pairForEmoji(panel, key);
  if (!pair) return;

  const guild = reaction.client.guilds.cache.get(guildId);
  if (!guild) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const decision = decideReactionRole({
    panel,
    pair,
    memberRoleIds: [...member.roles.cache.keys()],
    source: "reaction",
    event,
  });

  const result = await applyDecision(member, decision);
  if (result.blocked.length > 0) {
    log.warn(
      `Reaction roles: panel "${panel.id}" in ${guildId} cannot manage ${result.blocked.join(", ")}`,
    );
  }

  // Only an ADD can be cleared; the reaction is already gone on a remove.
  if (decision.clearReaction && event === "add") {
    markSelfRemoved(suppress);
    await reaction.users.remove(user.id).catch(() => {
      selfRemoved.delete(suppress);
    });
  }
}
