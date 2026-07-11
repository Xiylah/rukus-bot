import {
  Events,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
} from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { translationConfig } from "../lib/configCache.js";
import { translateText } from "../features/translation/translate.js";
import { translationEmbed } from "../features/translation/ui.js";
import { flagToCountryCode, COUNTRY_TO_LANG } from "../features/translation/lang.js";

// Dedup: one reply per (message, language), bounded so it can't grow forever.
const served = new Map<string, true>();
const SERVED_MAX = 1000;
function alreadyServed(messageId: string, lang: string): boolean {
  const key = `${messageId}:${lang}`;
  if (served.has(key)) return true;
  served.set(key, true);
  while (served.size > SERVED_MAX) {
    const oldest = served.keys().next().value;
    if (oldest === undefined) break;
    served.delete(oldest);
  }
  return false;
}

const handler: EventHandler<Events.MessageReactionAdd> = {
  name: Events.MessageReactionAdd,
  execute: async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) => {
    if (user.bot) return;

    // Resolve partials (reactions on uncached messages arrive partial).
    if (reaction.partial) {
      try {
        reaction = await reaction.fetch();
      } catch {
        return;
      }
    }
    const message = reaction.message;
    if (!message.guildId) return;

    const country = flagToCountryCode(reaction.emoji.name ?? "");
    if (!country) return;
    const targetLang = COUNTRY_TO_LANG[country];
    if (!targetLang) return;

    // Respect the guild's flag-reaction toggle.
    const trans = await translationConfig(message.guildId);
    if (!trans.flagReactions) return;

    if (alreadyServed(message.id, targetLang)) return;

    // Ensure we have the full message (content may be missing on partials).
    const full = message.partial ? await message.fetch().catch(() => null) : message;
    if (!full || full.author?.bot) return;
    const text = full.content?.trim();
    if (!text) return;

    const result = await translateText(text, targetLang);
    if (!result) return;

    const reactor = user.toString();
    await full
      .reply({
        content: `${reactor} requested a translation:`,
        embeds: [
          translationEmbed({ translated: result.text, src: result.src, target: targetLang }),
        ],
        allowedMentions: { repliedUser: false },
      })
      .catch(() => {});
  },
};

export default handler;
