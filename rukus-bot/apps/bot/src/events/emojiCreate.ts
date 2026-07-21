import { AuditLogEvent, Events, type GuildEmoji } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  byLine,
  compact,
  configFor,
  emit,
  executorOrNull,
  findExecutor,
  shouldLog,
} from "../features/logging/index.js";

/**
 * Create, delete, and update all sit behind the single `emojiUpdate` toggle:
 * nobody wants three switches for what is one concern ("did the emoji list
 * change?"). The loader takes one handler per file, so they are three files.
 */
const handler: EventHandler<Events.GuildEmojiCreate> = {
  name: Events.GuildEmojiCreate,
  execute: async (emoji: GuildEmoji) => {
    const config = await configFor(emoji.guild);
    if (!config) return;
    if (!shouldLog(config, "emojiUpdate")) return;

    const executor = await findExecutor(
      emoji.guild,
      AuditLogEvent.EmojiCreate,
      emoji.id,
    );

    const embed = compact(
      "😀 Emoji added",
      LOG_COLORS.create,
      null,
      [
        `${emoji} \`:${emoji.name}:\``,
        ...byLine(executorOrNull(executor)),
      ].join("\n"),
    ).setThumbnail(emoji.imageURL());

    await emit(emoji.guild, "emojiUpdate", embed);
  },
};

export default handler;
