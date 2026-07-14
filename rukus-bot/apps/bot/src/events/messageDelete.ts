import {
  AuditLogEvent,
  Events,
  type Message,
  type PartialMessage,
} from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  configFor,
  emit,
  executorText,
  findExecutor,
  messageDeleteEmbed,
  shouldLog,
} from "../features/logging/index.js";

const handler: EventHandler<Events.MessageDelete> = {
  name: Events.MessageDelete,
  execute: async (message: Message | PartialMessage) => {
    if (!message.guild) return;

    const config = await configFor(message.guild);
    if (!config) return;
    if (
      !shouldLog(config, "messageDelete", {
        channelId: message.channelId,
        userId: message.author?.id,
        isBot: message.author?.bot,
        content: message.content,
      })
    ) {
      return;
    }

    // Attribution is fuzzy and optional: a self-delete produces no audit entry
    // at all, which is indistinguishable from us lacking the permission.
    const executor = await findExecutor(
      message.guild,
      AuditLogEvent.MessageDelete,
      message.author?.id,
    );

    await emit(
      message.guild,
      "messageDelete",
      messageDeleteEmbed(message, executor ? executorText(executor) : null),
    );
  },
};

export default handler;
