import {
  AuditLogEvent,
  ChannelType,
  Events,
  type DMChannel,
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

const handler: EventHandler<Events.ChannelDelete> = {
  name: Events.ChannelDelete,
  execute: async (channel: DMChannel | GuildChannel) => {
    if (channel.isDMBased()) return;

    const config = await configFor(channel.guild);
    if (!config) return;
    if (!shouldLog(config, "channelDelete")) return;

    const executor = await findExecutor(
      channel.guild,
      AuditLogEvent.ChannelDelete,
      channel.id,
    );

    // No <#mention> here: the channel is gone, so the mention would render as a
    // dead "#deleted-channel". The name is the only useful record left.
    await emit(
      channel.guild,
      "channelDelete",
      compact(
        "🗑️ Channel deleted",
        LOG_COLORS.destroy,
        null,
        [
          `\`#${channel.name}\``,
          `-# ${ChannelType[channel.type] ?? "Unknown"} · \`${channel.id}\``,
          ...byLine(executorOrNull(executor)),
        ].join("\n"),
      ),
    );
  },
};

export default handler;
