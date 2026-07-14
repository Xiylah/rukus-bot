import { Events, type Message, type PartialMessage } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  configFor,
  emit,
  messageEditEmbed,
  shouldLog,
} from "../features/logging/index.js";

const handler: EventHandler<Events.MessageUpdate> = {
  name: Events.MessageUpdate,
  execute: async (
    before: Message | PartialMessage,
    after: Message | PartialMessage,
  ) => {
    if (!after.guild) return;

    // Discord fires MessageUpdate for embed hydration on link posts too. The
    // content is unchanged there, and logging it would bury the real edits.
    if (before.content === after.content) return;

    const config = await configFor(after.guild);
    if (!config) return;
    if (
      !shouldLog(config, "messageEdit", {
        channelId: after.channelId,
        userId: after.author?.id,
        isBot: after.author?.bot,
        content: after.content,
      })
    ) {
      return;
    }

    await emit(after.guild, "messageEdit", messageEditEmbed(before, after));
  },
};

export default handler;
