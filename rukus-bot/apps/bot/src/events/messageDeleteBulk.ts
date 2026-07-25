import {
  AuditLogEvent,
  Events,
  type GuildTextBasedChannel,
  type Message,
  type PartialMessage,
  type ReadonlyCollection,
  type Snowflake,
} from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  bulkDeleteEmbed,
  configFor,
  emit,
  executorText,
  findExecutor,
  shouldLog,
} from "../features/logging/index.js";
import { removeEntriesForMessages } from "../features/contests/service.js";
import { log } from "../lib/logger.js";

const handler: EventHandler<Events.MessageBulkDelete> = {
  name: Events.MessageBulkDelete,
  execute: async (
    messages: ReadonlyCollection<Snowflake, Message<true> | PartialMessage<true>>,
    channel: GuildTextBasedChannel,
  ) => {
    const guild = channel.guild;
    if (!guild) return;

    // Drop any contest entries caught in the purge, whether or not this guild
    // logs bulk deletes.
    const removed = await removeEntriesForMessages(guild.id, [...messages.keys()]);
    if (removed > 0) {
      log.info(`Contest: removed ${removed} entr(y/ies) caught in a bulk delete.`);
    }

    const config = await configFor(guild);
    if (!config) return;
    // No author to check here: a bulk delete spans many people, so only the
    // channel scope applies.
    if (!shouldLog(config, "messageBulkDelete", { channelId: channel.id })) return;

    const executor = await findExecutor(guild, AuditLogEvent.MessageBulkDelete);

    await emit(
      guild,
      "messageBulkDelete",
      bulkDeleteEmbed(
        channel.id,
        messages.size,
        [...messages.values()],
        executor ? executorText(executor) : null,
      ),
    );
  },
};

export default handler;
