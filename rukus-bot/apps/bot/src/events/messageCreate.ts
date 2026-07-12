import { Events, Message } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import {
  moderationConfig,
  translationConfig,
  autoResponderConfig,
} from "../lib/configCache.js";
import { checkFilters, logFiltered } from "../features/moderation/autoMod.js";
import { translateText } from "../features/translation/translate.js";
import { translationEmbed } from "../features/translation/ui.js";
import { classify } from "../features/autoresponder/classify.js";
import {
  eventEmbed,
  supportEmbed,
} from "../features/autoresponder/ui.js";
import { isTicketChannel } from "../features/tickets/isTicket.js";

/**
 * Main message pipeline - the TS equivalent of the Python on_message, but every
 * behavior is gated by that guild's config (read from cache). Order mirrors the
 * original: image-only channel → drug filter → auto-translate → auto-responder.
 */
const handler: EventHandler<Events.MessageCreate> = {
  name: Events.MessageCreate,
  execute: async (message: Message) => {
    if (message.author.bot || !message.inGuild()) return;

    const guildId = message.guildId;
    const content = message.content.trim();

    // --- Image-only channel: delete text-only messages ---
    const mod = await moderationConfig(guildId);
    if (mod.imageOnlyChannelId && message.channelId === mod.imageOnlyChannelId) {
      const hasAttachment = message.attachments.size > 0;
      const hasEmbedImage = message.embeds.some((e) => e.image || e.thumbnail);
      if (!hasAttachment && !hasEmbedImage) {
        await message.delete().catch(() => {});
      }
      return; // nothing else runs in the image-only channel
    }

    // --- Auto-moderation: drug filter, banned words, invites, mentions ---
    const hit = checkFilters(message, mod);
    if (hit) {
      await logFiltered(message, mod, hit); // log BEFORE deleting (content!)
      await message.delete().catch(() => {});
      if (message.channel.isSendable()) {
        await message.channel
          .send({ content: `${message.author} ${hit.warning}` })
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 10_000))
          .catch(() => {});
      }
      return;
    }

    if (!content || content.length < 8) return;

    // --- Auto-translation ---
    const trans = await translationConfig(guildId);
    if (trans.autoTranslate) {
      try {
        const result = await translateText(content, trans.targetLang);
        if (result) {
          await message.reply({
            embeds: [
              translationEmbed({
                translated: result.text,
                src: result.src,
                target: trans.targetLang,
              }),
            ],
            allowedMentions: { repliedUser: false },
          });
        }
      } catch (e) {
        log.warn(`Auto-translate failed: ${String(e)}`);
      }
    }

    // --- Event / lost-item auto-responder ---
    const ar = await autoResponderConfig(guildId);
    if (ar.enabled) {
      const intent = classify(content, ar.extraEventPhrases);
      // Never auto-respond inside a ticket: staff are already helping there,
      // and "open a support ticket" advice inside a ticket is nonsense.
      // (Checked only when we'd actually reply, and cached, so ordinary chat
      // costs no database lookups. Translation still works in tickets.)
      if (intent && (await isTicketChannel(message.channelId))) return;
      if (intent === "lost_items") {
        await message
          .reply({ embeds: [supportEmbed(ar.supportChannelId)] })
          .catch(() => {});
      } else if (intent === "event") {
        await message
          .reply({ embeds: [eventEmbed(ar.eventChannelId)] })
          .catch(() => {});
      }
    }
  },
};

export default handler;
