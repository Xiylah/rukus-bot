import { Events, Message } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import {
  moderationConfig,
  translationConfig,
  autoResponderConfig,
  customCommandsConfig,
} from "../lib/configCache.js";
import { checkFilters, logFiltered } from "../features/moderation/autoMod.js";
import { checkSpam } from "../features/moderation/antiSpam.js";
import { enforceSpam } from "../features/moderation/punish.js";
import { translateText } from "../features/translation/translate.js";
import { translationEmbed } from "../features/translation/ui.js";
import { runAutoResponder } from "../features/autoresponder/respond.js";
import { getTicketMeta } from "../features/tickets/isTicket.js";
import { findCommand, runCustomCommand } from "../features/custom/commands.js";

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

    // --- Anti-spam / anti-scam (runs first: this is the damaging stuff) ---
    // Staff and exempt roles bypass it, same as the other filters.
    const exempt =
      message.member?.permissions.has("ManageMessages") ||
      mod.exemptRoleIds.some((r) => message.member?.roles.cache.has(r));
    if (!exempt) {
      const spam = checkSpam(message, mod);
      if (spam) {
        await enforceSpam(message, mod, spam);
        return;
      }
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

    // --- Custom prefix commands (!codes etc.) ---
    // Before the length gate: commands are short by nature.
    if (content) {
      const cc = await customCommandsConfig(guildId);
      const cmd = findCommand(cc, content);
      if (cmd) {
        await runCustomCommand(message, cc, cmd);
        return;
      }
    }

    if (!content || content.length < 8) return;

    // --- Translation ---
    const trans = await translationConfig(guildId);
    const ticketMeta = await getTicketMeta(message.channelId);

    if (ticketMeta?.translateLang) {
      // Two-way ticket conversation mode: the opener's messages get translated
      // to the guild's language for staff; everyone else's messages get
      // translated to the opener's language. translateText() returns null when
      // the text is already in the target language, so nothing double-posts.
      const target =
        message.author.id === ticketMeta.openerId
          ? trans.targetLang || "en"
          : ticketMeta.translateLang;
      try {
        const result = await translateText(content, target);
        if (result) {
          await message.reply({
            embeds: [
              translationEmbed({ translated: result.text, src: result.src, target }),
            ],
            allowedMentions: { repliedUser: false },
          });
        }
      } catch (e) {
        log.warn(`Ticket conversation translate failed: ${String(e)}`);
      }
    } else if (trans.autoTranslate) {
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

    // --- Auto-responder (custom rules) ---
    const ar = await autoResponderConfig(guildId);
    if (ar.enabled) {
      // Never auto-respond inside a ticket: staff are already helping there,
      // and "open a support ticket" advice inside a ticket is nonsense.
      // ticketMeta is already loaded above, so this costs nothing extra.
      if (ticketMeta) return;
      await runAutoResponder(message, ar);
    }
  },
};

export default handler;
