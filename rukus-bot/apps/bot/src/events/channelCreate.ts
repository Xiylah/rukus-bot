import {
  AuditLogEvent,
  ChannelType,
  Events,
  type GuildChannel,
} from "discord.js";
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

const handler: EventHandler<Events.ChannelCreate> = {
  name: Events.ChannelCreate,
  execute: async (channel: GuildChannel) => {
    const config = await configFor(channel.guild);
    if (!config) return;
    if (!shouldLog(config, "channelCreate")) return;

    const executor = await findExecutor(
      channel.guild,
      AuditLogEvent.ChannelCreate,
      channel.id,
    );

    await emit(
      channel.guild,
      "channelCreate",
      compact(
        "📁 Channel created",
        LOG_COLORS.create,
        null,
        [
          `<#${channel.id}> (\`${channel.name}\`)`,
          `-# ${ChannelType[channel.type] ?? "Unknown"}`,
          ...byLine(executorOrNull(executor)),
        ].join("\n"),
      ),
    );
  },
};

export default handler;
