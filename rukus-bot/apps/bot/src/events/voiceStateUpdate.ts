import { Events, type VoiceState } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  compact,
  configFor,
  emit,
  shouldLog,
  userLine,
} from "../features/logging/index.js";
import { handleVoiceStateXp } from "../features/leveling/voice.js";
import { handleVoiceStateEarn } from "../features/economy/earn.js";
import { handleVoiceState } from "../features/tempvoice/tempvoice.js";

const handler: EventHandler<Events.VoiceStateUpdate> = {
  name: Events.VoiceStateUpdate,
  execute: async (before: VoiceState, after: VoiceState) => {
    const guild = after.guild ?? before.guild;
    if (!guild) return;

    handleVoiceStateXp(before, after);
    handleVoiceStateEarn(before, after);

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
        compact(
          "🔊 Joined voice",
          LOG_COLORS.create,
          after.member,
          `${userLine(after.member)} joined <#${after.channelId}>`,
        ),
      );
      return;
    }

    if (before.channelId && !after.channelId) {
      if (!shouldLog(config, "voiceLeave", { ...scope, channelId: before.channelId })) return;
      await emit(
        guild,
        "voiceLeave",
        compact(
          "🔇 Left voice",
          LOG_COLORS.destroy,
          before.member,
          `${userLine(before.member)} left <#${before.channelId}>`,
        ),
      );
      return;
    }

    if (before.channelId && after.channelId) {
      if (!shouldLog(config, "voiceMove", { ...scope, channelId: after.channelId })) return;
      await emit(
        guild,
        "voiceMove",
        compact(
          "↔️ Moved voice channel",
          LOG_COLORS.update,
          after.member,
          `${userLine(after.member)}\n<#${before.channelId}> → <#${after.channelId}>`,
        ),
      );
    }
  },
};

export default handler;
