import { Events, type VoiceState } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  base,
  configFor,
  emit,
  shouldLog,
  userLine,
} from "../features/logging/index.js";
import { handleVoiceStateXp } from "../features/leveling/voice.js";
import { handleVoiceState } from "../features/tempvoice/tempvoice.js";

const handler: EventHandler<Events.VoiceStateUpdate> = {
  name: Events.VoiceStateUpdate,
  execute: async (before: VoiceState, after: VoiceState) => {
    const guild = after.guild ?? before.guild;
    if (!guild) return;

    handleVoiceStateXp(before, after);

    // Join-to-create. Runs ahead of the logging returns below, and swallows its
    // own errors, so a guild with logging switched off still gets temp channels.
    void handleVoiceState(before, after);

    // Mute/deafen/stream toggles fire this event too, and nobody wants a log
    // line every time someone taps their mic.
    if (before.channelId === after.channelId) return;

    const config = await configFor(guild);
    if (!config) return;

    const user = after.member?.user ?? before.member?.user ?? null;
    const scope = { userId: user?.id, isBot: user?.bot };

    if (!before.channelId && after.channelId) {
      if (!shouldLog(config, "voiceJoin", { ...scope, channelId: after.channelId })) return;
      await emit(
        guild,
        "voiceJoin",
        base("🔊 Joined voice", LOG_COLORS.create, after.member).addFields(
          { name: "Member", value: userLine(after.member), inline: true },
          { name: "Channel", value: `<#${after.channelId}>`, inline: true },
        ),
      );
      return;
    }

    if (before.channelId && !after.channelId) {
      if (!shouldLog(config, "voiceLeave", { ...scope, channelId: before.channelId })) return;
      await emit(
        guild,
        "voiceLeave",
        base("🔇 Left voice", LOG_COLORS.destroy, before.member).addFields(
          { name: "Member", value: userLine(before.member), inline: true },
          { name: "Channel", value: `<#${before.channelId}>`, inline: true },
        ),
      );
      return;
    }

    if (before.channelId && after.channelId) {
      if (!shouldLog(config, "voiceMove", { ...scope, channelId: after.channelId })) return;
      await emit(
        guild,
        "voiceMove",
        base("↔️ Moved voice channel", LOG_COLORS.update, after.member).addFields(
          { name: "Member", value: userLine(after.member), inline: true },
          { name: "From", value: `<#${before.channelId}>`, inline: true },
          { name: "To", value: `<#${after.channelId}>`, inline: true },
        ),
      );
    }
  },
};

export default handler;
