import {
  ChannelType,
  type Client,
  type Guild,
  type GuildMember,
  type VoiceState,
} from "discord.js";
import type { LevelingConfig } from "@rukus/shared";
import { levelingConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import { addVoiceXp, applyRoleRewards, announceLevelUp } from "./service.js";

/**
 * Voice XP.
 *
 * A sweeper, not a join/leave stopwatch. Awarding on leave means a crash or a
 * deploy eats every minute anyone had banked, and it cannot notice that a call
 * dropped to one person halfway through. Sweeping the voice channels every
 * minute costs nothing (the states are already in the gateway cache), survives
 * restarts with at most a minute lost, and lets every rule below be enforced
 * continuously rather than once at the end.
 *
 * Eligibility is re-checked on every tick, so a member who mutes themselves or
 * whose call empties out simply stops earning from that minute on.
 */

const TICK_MS = 60_000;
/** Never pay out more than this in one tick, whatever the clock did. */
const MAX_MINUTES_PER_TICK = 2;

/**
 * When each member's currently-unpaid voice time started, keyed guildId:userId.
 * In-memory on purpose: a restart forfeiting up to one minute is the correct
 * trade against a database write per member per minute.
 */
const since = new Map<string, number>();

const key = (guildId: string, userId: string) => `${guildId}:${userId}`;

/** Whether this member, right now, is in a call that earns XP. */
export function isEarning(
  state: VoiceState,
  config: LevelingConfig,
  member: GuildMember,
  afkChannelId: string | null,
  headcount: number,
): boolean {
  if (!state.channelId) return false;
  if (member.user.bot) return false;
  if (config.voiceIgnoreChannelIds.includes(state.channelId)) return false;
  if (config.ignoreRoleIds.some((id) => member.roles.cache.has(id))) return false;
  if (config.voiceIgnoreAfk && afkChannelId === state.channelId) return false;
  // Server mutes are a moderation action, not a signal about participation, so
  // only the member's OWN mute/deafen counts here.
  if (config.voiceIgnoreMuted && (state.selfMute || state.selfDeaf)) return false;
  if (headcount < config.voiceMinMembers) return false;
  return true;
}

/** One pass over a single guild's voice channels. */
async function sweepGuild(guild: Guild, now: number): Promise<void> {
  const config = await levelingConfig(guild.id);
  if (!config.enabled || !config.voiceXpEnabled) return;

  const afkChannelId = guild.afkChannelId;

  for (const channel of guild.channels.cache.values()) {
    if (
      channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildStageVoice
    ) {
      continue;
    }

    // Bots parked in a call (music, recorders) must not be what makes the room
    // "busy enough" for the person sitting there alone to farm it.
    const humans = channel.members.filter((m) => !m.user.bot);
    const headcount = humans.size;

    for (const member of humans.values()) {
      const id = key(guild.id, member.id);
      const state = member.voice;

      if (!isEarning(state, config, member, afkChannelId, headcount)) {
        // Not earning: drop the clock so they cannot bank time by going AFK and
        // coming back to a minute's credit.
        since.delete(id);
        continue;
      }

      const start = since.get(id);
      if (start === undefined) {
        since.set(id, now);
        continue;
      }

      const minutes = Math.min(
        MAX_MINUTES_PER_TICK,
        Math.floor((now - start) / 60_000),
      );
      if (minutes < 1) continue;

      // Carry the remainder forward rather than resetting to `now`, or a member
      // loses a few seconds of credit every single tick.
      since.set(id, start + minutes * 60_000);

      const amount = Math.round(
        config.voiceXpPerMinute * minutes * config.xpRate,
      );
      if (amount <= 0) continue;

      try {
        const result = await addVoiceXp(guild.id, member.id, amount, minutes);
        if (result.leveledUpTo === null) continue;
        await applyRoleRewards(member, config, result.leveledUpTo);
        await announceLevelUp(member, config, result.leveledUpTo);
      } catch (err) {
        log.warn(`Leveling: voice XP award failed: ${String(err)}`);
      }
    }
  }
}

/** One pass over every guild the bot serves. */
export async function sweepVoiceXp(client: Client): Promise<void> {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    try {
      await sweepGuild(guild, now);
    } catch (err) {
      log.error(`Voice XP sweep failed for guild ${guild.id}:`, err);
    }
  }
}

/**
 * The voiceStateUpdate hook.
 *
 * The sweeper does the awarding; this only forgets the clock of anyone who has
 * left voice, so their entry cannot linger and pay out if they rejoin later.
 */
export function handleVoiceStateXp(before: VoiceState, after: VoiceState): void {
  const guildId = after.guild?.id ?? before.guild?.id;
  const userId = after.id ?? before.id;
  if (!guildId || !userId) return;
  if (before.channelId === after.channelId) return;
  if (!after.channelId) since.delete(key(guildId, userId));
}

/** Start the recurring voice sweep. */
export function startVoiceXpSweeper(client: Client): void {
  setInterval(() => void sweepVoiceXp(client), TICK_MS);
  log.info("Voice XP sweeper started (every 60s).");
}
