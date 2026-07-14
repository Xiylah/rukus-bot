import { PermissionFlagsBits, type Client, type Guild } from "discord.js";
import { log } from "../../lib/logger.js";
import {
  listTempRoles,
  setTempRoles,
  listLockedChannels,
  setLockedChannels,
  type LockedChannel,
} from "./state.js";

/**
 * Expires /temprole grants and timed /lockdowns.
 *
 * Same pattern as the ticket auto-close sweeper: state lives in the database,
 * so a redeploy cannot lose an expiry. A temp role that never expires because
 * the bot restarted is exactly the bug this avoids.
 */

const SWEEP_INTERVAL_MS = 60_000;

/** Put @everyone's SendMessages override back the way we found it. */
export async function restoreChannelLock(
  guild: Guild,
  entry: LockedChannel,
  reason: string,
): Promise<boolean> {
  const channel = await guild.channels.fetch(entry.channelId).catch(() => null);
  if (!channel || !("permissionOverwrites" in channel)) return false;

  const value =
    entry.previous === "allow" ? true : entry.previous === "deny" ? false : null;
  await channel.permissionOverwrites
    .edit(guild.roles.everyone, { SendMessages: value }, { reason })
    .catch((e) => log.warn(`Unlock of ${entry.channelId} failed: ${String(e)}`));
  return true;
}

async function sweepGuild(guild: Guild): Promise<void> {
  const now = Date.now();

  // --- Temp roles ---
  const temps = await listTempRoles(guild.id);
  const stillPending = temps.filter((t) => t.expiresAt > now);
  if (stillPending.length !== temps.length) {
    for (const expired of temps.filter((t) => t.expiresAt <= now)) {
      const member = await guild.members.fetch(expired.userId).catch(() => null);
      if (member?.roles.cache.has(expired.roleId)) {
        await member.roles
          .remove(expired.roleId, "Temporary role expired")
          .catch((e) => log.warn(`Temp role removal failed: ${String(e)}`));
      }
    }
    await setTempRoles(guild.id, stillPending);
  }

  // --- Lockdowns ---
  const locks = await listLockedChannels(guild.id);
  const due = locks.filter((l) => l.expiresAt !== null && l.expiresAt <= now);
  if (due.length > 0) {
    for (const entry of due) {
      await restoreChannelLock(guild, entry, "Lockdown expired");
    }
    await setLockedChannels(
      guild.id,
      locks.filter((l) => !due.includes(l)),
    );
  }
}

/** One pass over every guild. */
export async function sweepRoleExpiries(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      // No Manage Roles means every removal below would fail anyway; skip
      // rather than log a wall of identical permission errors every minute.
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        continue;
      }
      await sweepGuild(guild);
    } catch (err) {
      log.error(`Role/lockdown sweep failed for guild ${guild.id}:`, err);
    }
  }
}

/** Start the recurring sweep (first pass shortly after boot). */
export function startRoleSweeper(client: Client): void {
  setTimeout(() => void sweepRoleExpiries(client), 30_000);
  setInterval(() => void sweepRoleExpiries(client), SWEEP_INTERVAL_MS);
  log.info("Temp-role / lockdown sweeper started (every 60s).");
}
