import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type VoiceChannel,
  type VoiceState,
} from "discord.js";
import { prisma } from "@rukus/db";
import { tempVoiceConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";

/**
 * Temporary voice channels ("join to create").
 *
 * Joining the lobby channel makes you a personal voice channel, moves you into
 * it, and hands you control of it. When the last person leaves, it is deleted.
 *
 * The TempVoice table is what makes this safe. Without it, "delete the channel
 * when it empties" would be indistinguishable from "delete ANY empty voice
 * channel", and a restart would leave us with no idea which channels we created.
 * A row is our claim: no row, no delete. That is the one invariant here, and
 * everything below exists to keep it true.
 */

/** Discord's own cap on channels per guild. Well below it, but a runaway loop is real. */
const MAX_PER_GUILD = 50;

function renderName(template: string, member: { displayName: string }, count: number): string {
  return template
    .replace(/\{user\}/gi, member.displayName)
    .replace(/\{username\}/gi, member.displayName)
    .replace(/\{count\}/gi, String(count))
    .slice(0, 100) // Discord's channel-name limit.
    .trim();
}

/** Somebody joined the lobby: give them a channel of their own. */
async function createFor(state: VoiceState): Promise<void> {
  const guild = state.guild;
  const member = state.member;
  if (!member) return;

  const config = await tempVoiceConfig(guild.id);

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    log.warn(`Temp voice needs Manage Channels in ${guild.id}.`);
    return;
  }
  // Without Move Members we would create a channel and strand them in the lobby,
  // which is worse than doing nothing: they would sit there watching empty
  // channels pile up.
  if (!me.permissions.has(PermissionFlagsBits.MoveMembers)) {
    log.warn(`Temp voice needs Move Members in ${guild.id}.`);
    return;
  }

  const existing = await prisma.tempVoice.count({ where: { guildId: guild.id } });
  if (existing >= MAX_PER_GUILD) {
    log.warn(`Temp voice cap (${MAX_PER_GUILD}) reached in ${guild.id}.`);
    return;
  }

  // The count shown in the name is how many temp channels exist, so the first is
  // "#1". It is cosmetic; nothing keys off it.
  const name = renderName(config.nameTemplate, member, existing + 1) || member.displayName;

  let channel: VoiceChannel;
  try {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: config.categoryId ?? state.channel?.parentId ?? null,
      userLimit: config.userLimit,
      reason: `Temp voice for ${member.user.tag}`,
      permissionOverwrites: [
        {
          // The owner gets the controls people expect from "their" channel:
          // rename it, set a limit, drag people out. They do NOT get
          // ManageRoles, which would let them edit permission overwrites and
          // hand themselves powers the guild never granted.
          id: member.id,
          allow: [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers,
          ],
        },
      ],
    });
  } catch (err) {
    log.warn(`Could not create a temp voice channel in ${guild.id}: ${String(err)}`);
    return;
  }

  // Claim it BEFORE the move. If the move fails, or the process dies right here,
  // an unclaimed channel is one nothing will ever clean up; a claimed empty one
  // is swept on the next boot.
  try {
    await prisma.tempVoice.create({
      data: {
        guildId: guild.id,
        channelId: channel.id,
        ownerId: member.id,
      },
    });
  } catch (err) {
    log.warn(`Could not record the temp voice channel ${channel.id}: ${String(err)}`);
    await channel.delete("Could not record it, so it would leak").catch(() => {});
    return;
  }

  await member.voice
    .setChannel(channel, "Moving them into their temp voice channel")
    .catch(async (e) => {
      log.warn(`Could not move ${member.id} into their temp channel: ${String(e)}`);
      // They never arrived, so the channel is empty and nobody is coming. The
      // ready-time sweep would eventually get it, but leaving a stray channel in
      // the category until the next restart is scruffy.
      await destroy(guild, channel.id);
    });
}

/** Delete a temp channel and drop our claim on it. Safe to call twice. */
async function destroy(guild: Guild, channelId: string): Promise<void> {
  // Delete the row first. Two voiceStateUpdate events can race here (the last
  // two people leaving at once), and deleteMany on an already-deleted row is a
  // no-op that reports 0, which tells the loser of the race to stand down rather
  // than issue a second channel delete.
  const claim = await prisma.tempVoice
    .deleteMany({ where: { guildId: guild.id, channelId } })
    .catch((e) => {
      log.warn(`Could not release the temp voice claim on ${channelId}: ${String(e)}`);
      return { count: 0 };
    });
  if (claim.count === 0) return;

  const channel = guild.channels.cache.get(channelId);
  await channel?.delete("Temp voice channel is empty").catch(() => {});
}

/** A member left (or moved out of) a channel: bin it if it was ours and is now empty. */
async function cleanupLeft(state: VoiceState): Promise<void> {
  const channel = state.channel;
  if (!channel || channel.members.size > 0) return;

  // Only touch channels we actually created. Without this check an empty regular
  // voice channel that somebody happened to leave would get deleted.
  const claimed = await prisma.tempVoice.findFirst({
    where: { guildId: state.guild.id, channelId: channel.id },
  });
  if (!claimed) return;

  await destroy(state.guild, channel.id);
}

/**
 * The voiceStateUpdate hook. Called for every voice move in every guild, so it
 * bails out as early as it can.
 */
export async function handleVoiceState(
  before: VoiceState,
  after: VoiceState,
): Promise<void> {
  const guild = after.guild ?? before.guild;
  if (!guild) return;
  // Mic and deafen toggles fire this event too, and nothing here cares.
  if (before.channelId === after.channelId) return;

  const config = await tempVoiceConfig(guild.id);
  if (!config.enabled) return;

  try {
    // Left a channel: it may now be an empty temp channel.
    if (before.channelId) await cleanupLeft(before);

    // Joined the lobby: make them one. Checked AFTER the cleanup so that moving
    // straight from a dying temp channel into the lobby still works.
    if (
      config.lobbyChannelId &&
      after.channelId === config.lobbyChannelId &&
      !after.member?.user.bot
    ) {
      await createFor(after);
    }
  } catch (err) {
    log.error(`Temp voice failed in ${guild.id}:`, err);
  }
}

/**
 * On boot, reconcile the table against reality.
 *
 * The bot can be redeployed while temp channels are live. Anything that emptied
 * while we were down would otherwise sit there forever, because the
 * voiceStateUpdate that should have cleaned it up fired at a process that no
 * longer existed. Channels that still have people in them are left alone: they
 * are in use, and their row is still a valid claim, so the normal path will
 * collect them when they empty.
 */
export async function cleanupOrphans(client: Client): Promise<void> {
  let rows;
  try {
    rows = await prisma.tempVoice.findMany({ take: 500 });
  } catch (err) {
    log.error("Temp voice orphan sweep failed:", err);
    return;
  }

  let removed = 0;
  for (const row of rows) {
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild) {
      // We are not in that guild any more. The channel is beyond our reach, so
      // the row is just litter.
      await prisma.tempVoice.deleteMany({ where: { id: row.id } }).catch(() => {});
      continue;
    }

    const channel = guild.channels.cache.get(row.channelId);
    if (!channel) {
      // Already deleted, by staff or by a previous run. Drop the stale claim.
      await prisma.tempVoice.deleteMany({ where: { id: row.id } }).catch(() => {});
      continue;
    }

    if (channel.type === ChannelType.GuildVoice && channel.members.size === 0) {
      await destroy(guild, row.channelId);
      removed++;
    }
  }

  if (removed > 0) log.info(`Cleaned up ${removed} orphaned temp voice channel(s).`);
}
