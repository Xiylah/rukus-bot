import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { COLORS, type RaidConfig } from "@rukus/shared";
import { log } from "../../lib/logger.js";
import { verificationConfig } from "../../lib/configCache.js";
import {
  clearRaidState,
  getRaidState,
  setRaidState,
  type RaidState,
} from "./state.js";
import { resetJoins } from "./tracker.js";
import { ensureRaidSweeper } from "./sweeper.js";

/**
 * Raid mode: trip it when joins spike, undo it on lift.
 *
 * Channel locking is done here rather than by reusing the /lockdown feature so
 * a raid lift only ever touches the channels the RAID locked. Sharing lockdown's
 * durable list would let a raid auto-lift silently reopen a channel a human had
 * locked for an unrelated reason.
 */

const LOCKABLE = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
] as const;

function isLockable(channel: GuildBasedChannel): boolean {
  return (LOCKABLE as readonly ChannelType[]).includes(channel.type);
}

/** @everyone's current SendMessages override, so lift can restore it exactly. */
function currentOverride(
  guild: Guild,
  channel: GuildBasedChannel,
): "allow" | "deny" | "neutral" {
  if (!("permissionOverwrites" in channel)) return "neutral";
  const o = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
  if (!o) return "neutral";
  if (o.deny.has(PermissionFlagsBits.SendMessages)) return "deny";
  if (o.allow.has(PermissionFlagsBits.SendMessages)) return "allow";
  return "neutral";
}

async function lockEveryChannel(
  guild: Guild,
): Promise<RaidState["lockedChannels"]> {
  const locked: RaidState["lockedChannels"] = [];
  for (const channel of guild.channels.cache.values()) {
    if (!isLockable(channel) || !("permissionOverwrites" in channel)) continue;
    const previous = currentOverride(guild, channel);
    const ok = await channel.permissionOverwrites
      .edit(guild.roles.everyone, { SendMessages: false }, { reason: "Raid mode" })
      .then(() => true)
      .catch(() => false);
    if (ok) locked.push({ channelId: channel.id, previous });
  }
  return locked;
}

async function restoreChannels(
  guild: Guild,
  locked: RaidState["lockedChannels"],
): Promise<void> {
  for (const entry of locked) {
    const channel = await guild.channels.fetch(entry.channelId).catch(() => null);
    if (!channel || !("permissionOverwrites" in channel)) continue;
    const value =
      entry.previous === "allow" ? true : entry.previous === "deny" ? false : null;
    await channel.permissionOverwrites
      .edit(guild.roles.everyone, { SendMessages: value }, { reason: "Raid lifted" })
      .catch((e) => log.warn(`Raid unlock of ${entry.channelId} failed: ${String(e)}`));
  }
}

async function alert(
  guild: Guild,
  config: RaidConfig,
  title: string,
  description: string,
  color: number,
): Promise<void> {
  if (!config.alertChannelId) return;
  const channel = await guild.channels.fetch(config.alertChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await (channel as TextChannel)
    .send({ embeds: [{ title, description, color }] })
    .catch(() => {});
}

/**
 * Trip raid mode. Applies the configured action to the members who joined during
 * the spike, posts an alert, and records durable state so a lift (manual or the
 * auto-lift sweep) can undo exactly what it did. Idempotent: a second trigger
 * while already active only re-alerts.
 */
export async function triggerRaid(
  guild: Guild,
  config: RaidConfig,
  spikeMemberIds: string[],
): Promise<void> {
  const existing = await getRaidState(guild.id);
  if (existing.active) return;

  const now = Date.now();
  const liftAt =
    config.autoLiftMinutes > 0 ? now + config.autoLiftMinutes * 60_000 : null;

  // Start the lift sweep from the trip itself, not only from a join. A raid that
  // kicks or locks stops the very joins that would otherwise start the sweeper,
  // and /raid panic never passes through the join path at all, so without this an
  // auto-lift could stay pending forever.
  if (liftAt) ensureRaidSweeper(guild.client);

  let lockedChannels: RaidState["lockedChannels"] = [];
  let actionSummary = "";

  switch (config.action) {
    case "lockdown":
      lockedChannels = await lockEveryChannel(guild);
      actionSummary = `Locked **${lockedChannels.length}** channel(s).`;
      break;
    case "kick-new": {
      let kicked = 0;
      for (const id of spikeMemberIds) {
        const member = await guild.members.fetch(id).catch(() => null);
        if (member?.kickable) {
          const ok = await member
            .kick("Raid protection: joined during a join spike")
            .then(() => true)
            .catch(() => false);
          if (ok) kicked++;
        }
      }
      actionSummary = `Kicked **${kicked}** account(s) that joined during the spike.`;
      break;
    }
    case "quarantine": {
      const vconfig = await verificationConfig(guild.id);
      const roleId = vconfig.unverifiedRoleId;
      const me = guild.members.me;
      let held = 0;
      if (roleId && me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        const role = guild.roles.cache.get(roleId);
        const usable =
          role && !role.managed && role.position < me.roles.highest.position;
        if (usable) {
          for (const id of spikeMemberIds) {
            const member = await guild.members.fetch(id).catch(() => null);
            if (!member) continue;
            const ok = await member.roles
              .add(roleId, "Raid protection: quarantined")
              .then(() => true)
              .catch(() => false);
            if (ok) held++;
          }
        }
      }
      actionSummary = roleId
        ? `Quarantined **${held}** account(s) from the spike.`
        : "No quarantine role is set (configure one under Verification), so nobody was quarantined.";
      break;
    }
    case "alert-only":
      actionSummary = "Alert only, no automatic action taken.";
      break;
  }

  await setRaidState(guild.id, {
    active: true,
    startedAt: now,
    liftAt,
    action: config.action,
    lockedChannels,
  });
  // Clear the detection window so the same joins can't re-trip it a second time.
  resetJoins(guild.id);

  await alert(
    guild,
    config,
    "🚨 Raid mode ON",
    `A join spike tripped raid protection (${config.joinRateCount} joins in ` +
      `${config.joinRateSeconds}s).\n${actionSummary}\n` +
      (liftAt
        ? `Auto-lifts <t:${Math.floor(liftAt / 1000)}:R>. Use \`/raid lift\` to end it now.`
        : // No auto-lift configured: say so loudly. A legitimate traffic spike (a
          // shoutout) can trip this, and a locked server that nobody realises is
          // waiting on a human is worse than the raid.
          "⚠️ **Auto-lift is off, this will NOT end on its own.** Run `/raid lift` to " +
          "restore the server. If this was a legitimate traffic spike, raise the " +
          "trigger rate or set an auto-lift under Dashboard > Raid.") +
      (config.action === "lockdown" && !liftAt
        ? "\nEvery channel stays read-only until then."
        : ""),
    COLORS.danger,
  );

  log.info(`Raid mode ON in ${guild.id}: ${config.action}. ${actionSummary}`);
}

/**
 * Lift raid mode: restore any channels it locked and clear state. Safe to call
 * when no raid is active (returns false). Returns true when a raid was lifted.
 */
export async function liftRaid(
  guild: Guild,
  config: RaidConfig,
  reason: string,
): Promise<boolean> {
  const state = await getRaidState(guild.id);
  if (!state.active) return false;

  if (state.lockedChannels.length > 0) {
    await restoreChannels(guild, state.lockedChannels);
  }
  await clearRaidState(guild.id);
  resetJoins(guild.id);

  await alert(
    guild,
    config,
    "✅ Raid mode OFF",
    `Raid protection lifted (${reason}).` +
      (state.lockedChannels.length > 0
        ? ` Restored **${state.lockedChannels.length}** channel(s).`
        : ""),
    COLORS.success,
  );

  log.info(`Raid mode OFF in ${guild.id}: ${reason}.`);
  return true;
}
