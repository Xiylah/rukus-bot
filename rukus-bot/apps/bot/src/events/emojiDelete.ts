import { AuditLogEvent, Events, type GuildEmoji } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  base,
  configFor,
  emit,
  executorText,
  findExecutor,
  shouldLog,
} from "../features/logging/index.js";

const handler: EventHandler<Events.GuildEmojiDelete> = {
  name: Events.GuildEmojiDelete,
  execute: async (emoji: GuildEmoji) => {
    const config = await configFor(emoji.guild);
    if (!config) return;
    if (!shouldLog(config, "emojiUpdate")) return;

    const executor = await findExecutor(
      emoji.guild,
      AuditLogEvent.EmojiDelete,
      emoji.id,
    );

    // Rendering the emoji itself would show a broken image: it no longer exists.
    const embed = base("🗑️ Emoji removed", LOG_COLORS.destroy).addFields(
      { name: "Emoji", value: `\`:${emoji.name}:\`\n\`${emoji.id}\``, inline: true },
      { name: "Removed by", value: executorText(executor), inline: true },
    );

    await emit(emoji.guild, "emojiUpdate", embed);
  },
};

export default handler;
