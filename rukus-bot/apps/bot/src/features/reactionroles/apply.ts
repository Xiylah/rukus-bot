import { PermissionFlagsBits, type GuildMember } from "discord.js";
import type { RrDecision } from "@rukus/shared";
import { log } from "../../lib/logger.js";

/**
 * Turning a decision into real role changes.
 *
 * Every failure here is silent-but-reported: a member clicking a button must
 * never see a raw Discord error, and a misconfigured panel (role above the bot,
 * missing Manage Roles) must not take the bot down.
 */

/** True when the bot could actually grant/revoke this role right now. */
function manageable(member: GuildMember, roleId: string): boolean {
  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
  const role = member.guild.roles.cache.get(roleId);
  // Discord refuses managed (bot/booster) roles and anything at or above the
  // bot's highest role, so filtering here turns a 403 into a clear message.
  if (!role || role.managed) return false;
  return me.roles.highest.comparePositionTo(role) > 0;
}

export interface ApplyResult {
  /** Roles that actually changed hands. */
  added: string[];
  removed: string[];
  /** Roles the panel wanted to touch but the bot cannot manage. */
  blocked: string[];
}

export async function applyDecision(
  member: GuildMember,
  decision: RrDecision,
): Promise<ApplyResult> {
  const result: ApplyResult = { added: [], removed: [], blocked: [] };

  const add = decision.add.filter((r) => !member.roles.cache.has(r));
  const remove = decision.remove.filter((r) => member.roles.cache.has(r));

  for (const roleId of [...add, ...remove]) {
    if (!manageable(member, roleId)) result.blocked.push(roleId);
  }

  const toAdd = add.filter((r) => !result.blocked.includes(r));
  const toRemove = remove.filter((r) => !result.blocked.includes(r));

  try {
    // One call each: two edits would fire two audit-log entries and two
    // GUILD_MEMBER_UPDATE events for what is a single member action.
    if (toRemove.length > 0) {
      await member.roles.remove(toRemove, "Reaction roles");
      result.removed = toRemove;
    }
    if (toAdd.length > 0) {
      await member.roles.add(toAdd, "Reaction roles");
      result.added = toAdd;
    }
  } catch (err) {
    log.warn(
      `Reaction roles: role update failed for ${member.id} in ${member.guild.id}`,
      err,
    );
    result.blocked.push(...toAdd, ...toRemove);
    result.added = [];
    result.removed = [];
  }

  return result;
}

/** What to tell the member after their click. */
export function resultMessage(decision: RrDecision, result: ApplyResult): string {
  if (result.blocked.length > 0) {
    return (
      "I couldn't change " +
      result.blocked.map((r) => `<@&${r}>`).join(", ") +
      ". My role has to sit ABOVE it in Server Settings > Roles, and I need Manage Roles."
    );
  }
  if (decision.message) return decision.message;
  return "Nothing changed.";
}
