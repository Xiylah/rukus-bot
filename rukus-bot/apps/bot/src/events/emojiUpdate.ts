import { AuditLogEvent, Events, type GuildEmoji } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  base,
  changeLine,
  configFor,
  emit,
  executorText,
  findExecutor,
  shouldLog,
} from "../features/logging/index.js";

const handler: EventHandler<Events.GuildEmojiUpdate> = {
  name: Events.GuildEmojiUpdate,
  execute: async (before: GuildEmoji, after: GuildEmoji) => {
    if (before.name === after.name) return;

    const config = await configFor(after.guild);
    if (!config) return;
    if (!shouldLog(config, "emojiUpdate")) return;

    const executor = await findExecutor(
      after.guild,
      AuditLogEvent.EmojiUpdate,
      after.id,
    );

    const embed = base("✏️ Emoji renamed", LOG_COLORS.update).addFields(
      { name: "Emoji", value: `${after}`, inline: true },
      { name: "Renamed by", value: executorText(executor), inline: true },
      { name: "Name", value: changeLine(before.name, after.name) },
    );
    embed.setThumbnail(after.imageURL());

    await emit(after.guild, "emojiUpdate", embed);
  },
};

export default handler;
