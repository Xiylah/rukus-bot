import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type GuildMember,
} from "discord.js";
import { prisma } from "@rukus/db";
import { COLORS } from "@rukus/shared";
import { highlightsConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";

/**
 * Highlights: DM a member when a word they subscribed to is said.
 *
 * The rules that make this tolerable rather than infuriating:
 *   - whole-word matching only, so "cat" does not fire on "catastrophe"
 *   - never notify the author about their own message
 *   - never notify someone who cannot even read the channel (that would leak
 *     the content of a private channel to anyone who highlighted a common word)
 *   - never notify someone who is already active in that channel: they can see
 *     it themselves, and a DM for a message they just read is pure noise
 */

/** Recent speakers per channel, so we can suppress "they're already here" DMs. */
const lastSpoke = new Map<string, number>(); // `${channelId}:${userId}` -> ts
/** Last DM per member, enforcing the guild's cooldown. */
const lastNotified = new Map<string, number>(); // `${guildId}:${userId}` -> ts

/** How long after speaking in a channel a member is considered "present". */
const PRESENT_MS = 5 * 60_000;

/** Whole-word, case-insensitive. Multi-word highlights match as a phrase. */
export function matchesHighlight(content: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(
    content,
  );
}

/**
 * Called from messageCreate. Fire-and-forget: highlights are a nicety, and a
 * DM failure must never interfere with the rest of the message pipeline.
 */
export async function runHighlights(message: Message): Promise<void> {
  if (!message.inGuild()) return;
  const guildId = message.guildId;
  const now = Date.now();

  // Record presence BEFORE the enabled check: if the feature is toggled on
  // mid-conversation, we still want a sane idea of who is here.
  lastSpoke.set(`${message.channelId}:${message.author.id}`, now);

  const config = await highlightsConfig(guildId);
  if (!config.enabled) return;

  const content = message.content;
  if (!content) return;

  try {
    const highlights = await prisma.highlight.findMany({ where: { guildId } });
    if (highlights.length === 0) return;

    // One member may have several matching words; DM them once.
    const hitUsers = new Set<string>();
    for (const h of highlights) {
      if (h.userId === message.author.id) continue;
      if (hitUsers.has(h.userId)) continue;
      if (matchesHighlight(content, h.word)) hitUsers.add(h.userId);
    }
    if (hitUsers.size === 0) return;

    for (const userId of hitUsers) {
      if (now - (lastSpoke.get(`${message.channelId}:${userId}`) ?? 0) < PRESENT_MS) {
        continue; // they are in the channel right now, they saw it
      }
      const cooldownKey = `${guildId}:${userId}`;
      if (now - (lastNotified.get(cooldownKey) ?? 0) < config.cooldownSec * 1000) {
        continue;
      }

      const member: GuildMember | null = await message.guild.members
        .fetch(userId)
        .catch(() => null);
      if (!member) continue;

      // The access check: a highlight must never become a read-any-channel
      // exploit. If they cannot view the channel, they do not get the message.
      const perms = message.channel.permissionsFor(member);
      if (!perms?.has(PermissionFlagsBits.ViewChannel)) continue;

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setAuthor({
          name: message.author.tag,
          iconURL: message.author.displayAvatarURL(),
        })
        .setDescription(content.slice(0, 1000))
        .addFields({
          name: "Where",
          value: `[#${"name" in message.channel ? message.channel.name : "channel"}](${message.url})`,
        })
        .setFooter({ text: "Highlight - manage yours with /highlight" })
        .setTimestamp(message.createdAt);

      const sent = await member
        .send({ embeds: [embed] })
        .then(() => true)
        .catch(() => false);
      // Only start the cooldown on a DM that actually landed, otherwise a
      // closed-DMs member would be "cooling down" from nothing.
      if (sent) lastNotified.set(cooldownKey, now);
    }
  } catch (err) {
    log.warn(`Highlight check failed: ${String(err)}`);
  }
}
