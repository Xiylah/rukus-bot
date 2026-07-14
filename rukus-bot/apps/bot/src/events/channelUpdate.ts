import {
  AuditLogEvent,
  Events,
  type DMChannel,
  type GuildChannel,
} from "discord.js";
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

/** Topic and slowmode only exist on text-like channels. */
function textBits(channel: GuildChannel): { topic: string | null; slowmode: number | null } {
  if (!channel.isTextBased() || channel.isThread()) return { topic: null, slowmode: null };
  const c = channel as GuildChannel & { topic?: string | null; rateLimitPerUser?: number };
  return { topic: c.topic ?? null, slowmode: c.rateLimitPerUser ?? null };
}

const handler: EventHandler<Events.ChannelUpdate> = {
  name: Events.ChannelUpdate,
  execute: async (
    before: DMChannel | GuildChannel,
    after: DMChannel | GuildChannel,
  ) => {
    if (after.isDMBased() || before.isDMBased()) return;

    const config = await configFor(after.guild);
    if (!config) return;
    if (!shouldLog(config, "channelUpdate", { channelId: after.id })) return;

    const beforeBits = textBits(before);
    const afterBits = textBits(after);

    const fields: { name: string; value: string }[] = [];
    if (before.name !== after.name) {
      fields.push({ name: "Name", value: changeLine(before.name, after.name) });
    }
    if (beforeBits.topic !== afterBits.topic) {
      fields.push({ name: "Topic", value: changeLine(beforeBits.topic, afterBits.topic) });
    }
    if (beforeBits.slowmode !== afterBits.slowmode) {
      fields.push({
        name: "Slowmode",
        value: changeLine(
          beforeBits.slowmode === null ? null : `${beforeBits.slowmode}s`,
          afterBits.slowmode === null ? null : `${afterBits.slowmode}s`,
        ),
      });
    }

    // Permission-overwrite churn fires this event constantly (every role edit
    // touches every channel). Without a real diff there is nothing to report.
    if (fields.length === 0) return;

    const executor = await findExecutor(
      after.guild,
      AuditLogEvent.ChannelUpdate,
      after.id,
    );

    await emit(
      after.guild,
      "channelUpdate",
      base("⚙️ Channel updated", LOG_COLORS.update).addFields(
        { name: "Channel", value: `<#${after.id}>`, inline: true },
        { name: "Changed by", value: executorText(executor), inline: true },
        ...fields,
      ),
    );
  },
};

export default handler;
