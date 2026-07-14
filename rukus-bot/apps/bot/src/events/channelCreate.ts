import {
  AuditLogEvent,
  ChannelType,
  Events,
  type GuildChannel,
} from "discord.js";
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
      base("📁 Channel created", LOG_COLORS.create).addFields(
        { name: "Channel", value: `<#${channel.id}> (\`${channel.name}\`)`, inline: true },
        { name: "Type", value: ChannelType[channel.type] ?? "Unknown", inline: true },
        { name: "Created by", value: executorText(executor), inline: true },
      ),
    );
  },
};

export default handler;
