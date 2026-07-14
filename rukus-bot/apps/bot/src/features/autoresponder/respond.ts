import { EmbedBuilder, type Message } from "discord.js";
import {
  evaluateAll,
  renderResponse,
  migrateLegacyRules,
  type AutoResponderConfig,
} from "@rukus/shared";
import { log } from "../../lib/logger.js";

/**
 * Runs the guild's auto-responder rules against a message and posts the
 * winning rule's response.
 *
 * All matching logic lives in @rukus/shared, so the dashboard's test box and
 * the live bot behave identically.
 */

/** Per-rule, per-channel cooldowns so a rule can't spam a busy channel. */
const cooldowns = new Map<string, number>();
const COOLDOWN_MAX = 2000;

function onCooldown(ruleId: string, channelId: string, seconds: number): boolean {
  if (seconds <= 0) return false;
  const key = `${ruleId}:${channelId}`;
  const now = Date.now();
  const until = cooldowns.get(key);
  if (until && until > now) return true;
  cooldowns.set(key, now + seconds * 1000);
  while (cooldowns.size > COOLDOWN_MAX) {
    const oldest = cooldowns.keys().next().value;
    if (oldest === undefined) break;
    cooldowns.delete(oldest);
  }
  return false;
}

function hexToInt(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(n) ? 0x5865f2 : n;
}

/** Returns true when a rule fired. */
export async function runAutoResponder(
  message: Message<true>,
  config: AutoResponderConfig,
): Promise<boolean> {
  // Legacy configs are upgraded on the fly, so behavior is preserved even
  // before the admin opens the dashboard and saves.
  const cfg = migrateLegacyRules(config);
  if (cfg.rules.length === 0) return false;

  const { best } = evaluateAll(cfg, message.content, {
    channelId: message.channelId,
    roleIds: message.member?.roles.cache.map((r) => r.id) ?? [],
  });
  if (!best) return false;

  const rule = best.rule;
  if (onCooldown(rule.id, message.channelId, rule.cooldownSec)) return false;

  const text = renderResponse(rule.responseText, {
    userId: message.author.id,
    serverName: message.guild.name,
    channelId: message.channelId,
  });

  // The response text is dashboard-authored, and an "@everyone" in it would be
  // sent as a real mass-ping. Allow user mentions (the response often addresses
  // the asker) but never parse everyone/here or role pings.
  const allowedMentions = { parse: ["users"] as const, repliedUser: false };

  const payload: Parameters<Message["reply"]>[0] = rule.useEmbed
    ? {
        embeds: [
          new EmbedBuilder()
            .setColor(hexToInt(rule.embedColor))
            .setTitle(rule.embedTitle || null)
            .setDescription(text || null),
        ],
        allowedMentions,
      }
    : { content: text, allowedMentions };

  try {
    const sent = rule.replyToUser
      ? await message.reply(payload)
      : await message.channel.send(payload);

    if (rule.deleteAfterSec > 0) {
      setTimeout(
        () => void sent.delete().catch(() => {}),
        rule.deleteAfterSec * 1000,
      );
    }
    return true;
  } catch (err) {
    log.warn(`Auto-responder rule "${rule.name}" failed to post: ${String(err)}`);
    return false;
  }
}
