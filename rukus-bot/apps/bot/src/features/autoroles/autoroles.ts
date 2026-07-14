import type { GuildMember, PartialGuildMember } from "discord.js";
import { prisma } from "@rukus/db";
import type { AutoRolesConfig } from "@rukus/shared";
import { autoRolesConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";

/**
 * Auto-roles: what a member gets handed on join, and what they get back on a
 * rejoin.
 *
 * The restore half is a security feature, not a convenience feature. Read
 * decideRestoreRoles() before changing it.
 */

/**
 * Which of a returning member's snapshotted roles they may actually have back.
 *
 * Pure, so the rule is obvious and testable.
 *
 * WHY the blocklist exists: without it, "leave and rejoin" is a free punishment
 * wipe. A muted member drops the muted role by leaving; if we restored their
 * snapshot verbatim we would hand back everything EXCEPT what actually matters,
 * and worse, an admin who restores a stale snapshot could silently regrant a
 * staff role that was deliberately removed while they were gone. So the guild's
 * restoreBlockedRoleIds (muted, staff, anything load-bearing) are subtracted
 * unconditionally, and the muted role gets reapplied by the moderation feature
 * on its own terms, not by us.
 *
 * We also drop the managed roles (boosts, bot/integration roles): Discord owns
 * those and re-adding them by hand fails anyway.
 */
export function decideRestoreRoles(
  snapshot: string[],
  config: AutoRolesConfig,
  context: { everyoneRoleId: string; managedRoleIds: string[]; assignableRoleIds: string[] },
): string[] {
  const blocked = new Set(config.restoreBlockedRoleIds);
  const managed = new Set(context.managedRoleIds);
  const assignable = new Set(context.assignableRoleIds);

  return snapshot.filter(
    (id) =>
      id !== context.everyoneRoleId &&
      !blocked.has(id) &&
      !managed.has(id) &&
      assignable.has(id),
  );
}

/** Snapshot a leaving member's roles so a rejoin can restore them. */
export async function backupRoles(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const guildId = member.guild.id;
  const config = await autoRolesConfig(guildId);
  if (!config.enabled || !config.restoreRoles) return;

  // A partial member has no role cache: there is nothing to snapshot, and
  // writing an empty array would DESTROY a good snapshot from a previous leave.
  if (member.partial) return;

  const roleIds = [...member.roles.cache.keys()].filter(
    (id) => id !== member.guild.roles.everyone.id,
  );

  try {
    await prisma.memberRoleBackup.upsert({
      where: { guildId_userId: { guildId, userId: member.id } },
      create: { guildId, userId: member.id, roleIds },
      update: { roleIds },
    });
  } catch (err) {
    log.warn(`Role backup failed for ${member.id}: ${String(err)}`);
  }
}

/** Grant the join roles and kick off any timed roles. Called on guildMemberAdd. */
export async function applyAutoRoles(member: GuildMember): Promise<void> {
  const guildId = member.guild.id;
  const config = await autoRolesConfig(guildId);
  if (!config.enabled) return;

  try {
    // Bots get botRoleIds INSTEAD of joinRoleIds, so they skip member-only
    // roles (verified, level roles) that would be nonsense on a bot.
    const immediate = member.user.bot ? config.botRoleIds : config.joinRoleIds;
    for (const roleId of immediate) {
      await member.roles
        .add(roleId, "Auto-role on join")
        .catch((e) => log.warn(`Auto-role ${roleId} failed: ${String(e)}`));
    }

    if (!member.user.bot && config.restoreRoles) {
      await restoreRoles(member, config);
    }

    if (!member.user.bot) scheduleTimedRoles(member, config);
  } catch (err) {
    log.warn(`Auto-roles failed for ${member.id}: ${String(err)}`);
  }
}

/** Give a returning member back what they may keep, then drop the snapshot. */
async function restoreRoles(member: GuildMember, config: AutoRolesConfig): Promise<void> {
  const guildId = member.guild.id;
  const backup = await prisma.memberRoleBackup.findUnique({
    where: { guildId_userId: { guildId, userId: member.id } },
  });
  if (!backup || backup.roleIds.length === 0) return;

  const me = member.guild.members.me;
  const highest = me?.roles.highest.position ?? 0;
  const assignable = member.guild.roles.cache
    .filter((r) => r.position < highest && !r.managed)
    .map((r) => r.id);
  const managed = member.guild.roles.cache.filter((r) => r.managed).map((r) => r.id);

  const toRestore = decideRestoreRoles(backup.roleIds, config, {
    everyoneRoleId: member.guild.roles.everyone.id,
    managedRoleIds: managed,
    assignableRoleIds: assignable,
  });
  if (toRestore.length === 0) return;

  await member.roles
    .add(toRestore, "Restoring roles from before they left")
    .catch((e) => log.warn(`Role restore failed for ${member.id}: ${String(e)}`));

  // Consume the snapshot. Keeping it would let a member who left, rejoined, and
  // then had a role stripped by staff simply leave and rejoin again to get it
  // back from the stale copy.
  await prisma.memberRoleBackup
    .delete({ where: { guildId_userId: { guildId, userId: member.id } } })
    .catch(() => {});
}

/**
 * Timed roles fire in-process. They are deliberately NOT a database schedule:
 * the delays are short-lived (minutes to hours) and a missed grant after a
 * restart is recoverable by rejoining or by staff, whereas a missed reminder is
 * not. Keeping them in memory keeps the sweeper honest about what it owns.
 */
function scheduleTimedRoles(member: GuildMember, config: AutoRolesConfig): void {
  for (const timed of config.timedRoles) {
    setTimeout(
      () => {
        void (async () => {
          // Re-fetch: they may have left, or staff may have already given it.
          const fresh = await member.guild.members
            .fetch(member.id)
            .catch(() => null);
          if (!fresh || fresh.roles.cache.has(timed.roleId)) return;
          await fresh.roles
            .add(timed.roleId, `Timed auto-role after ${timed.delaySec}s`)
            .catch((e) => log.warn(`Timed role ${timed.roleId} failed: ${String(e)}`));
        })();
      },
      timed.delaySec * 1000,
    );
  }
}
