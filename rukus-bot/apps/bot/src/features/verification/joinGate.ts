import { PermissionFlagsBits, type GuildMember } from "discord.js";
import { verificationConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";

/**
 * The join gate: run once per join from guildMemberAdd. It screens the account
 * age and quarantines fresh members until they verify.
 *
 * Kept tiny and self-contained so the shared guildMemberAdd handler only has to
 * make one additive, error-swallowing call into it.
 */

const DAY_MS = 86_400_000;

/** Add the quarantine role, if one is set and the bot can assign it. */
async function quarantine(
  member: GuildMember,
  roleId: string | undefined,
  reason: string,
): Promise<boolean> {
  if (!roleId) return false;
  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    log.warn(
      `Verification: can't quarantine in ${member.guild.id}, missing Manage Roles.`,
    );
    return false;
  }
  const role = member.guild.roles.cache.get(roleId);
  if (!role || role.managed || role.position >= me.roles.highest.position) {
    log.warn(
      `Verification: can't apply quarantine role ${roleId} in ${member.guild.id} (missing, managed, or above the bot).`,
    );
    return false;
  }
  return member.roles
    .add(roleId, reason)
    .then(() => true)
    .catch((e) => {
      log.warn(`Quarantine role add failed: ${String(e)}`);
      return false;
    });
}

/**
 * What the gate did with this member. `held` is the load-bearing bit: when true
 * the member is quarantined or gone, and the caller MUST NOT auto-role or greet
 * them, or the gate is decorative (auto-roles would hand a raider the very access
 * the quarantine role withholds).
 */
export interface JoinGateResult {
  held: boolean;
}

export async function runJoinGate(member: GuildMember): Promise<JoinGateResult> {
  if (member.user.bot) return { held: false };

  const config = await verificationConfig(member.guild.id);
  if (!config.enabled) return { held: false };

  // ---- Account-age gate ----
  if (config.minAccountAgeDays > 0) {
    const ageDays = (Date.now() - member.user.createdTimestamp) / DAY_MS;
    if (ageDays < config.minAccountAgeDays) {
      if (config.minAccountAgeAction === "kick") {
        // DM first: once kicked we can no longer reach them, and a silent kick
        // reads as a ban to a confused new member.
        await member
          .send(
            `Your account is too new to join **${member.guild.name}** ` +
              `(accounts must be at least ${config.minAccountAgeDays} day(s) old). ` +
              "You're welcome back once your account is a little older.",
          )
          .catch(() => {});
        if (member.kickable) {
          const kicked = await member
            .kick(`Account younger than ${config.minAccountAgeDays} day(s)`)
            .then(() => true)
            .catch((e) => {
              log.warn(`Age-gate kick failed: ${String(e)}`);
              return false;
            });
          if (kicked) return { held: true };
        } else {
          log.warn(
            `Verification: wanted to kick ${member.id} for account age but lack permission/hierarchy in ${member.guild.id}.`,
          );
        }
        // The kick did not land, so this too-new account is still in the server.
        // Fall back to quarantine rather than letting it through: a failed gate
        // must never be softer than a passing one.
        return {
          held: await quarantine(
            member,
            config.unverifiedRoleId,
            "Account below minimum age: kick failed, quarantined instead",
          ),
        };
      }
      if (config.minAccountAgeAction === "quarantine") {
        return {
          held: await quarantine(
            member,
            config.unverifiedRoleId,
            "Account below minimum age: quarantined until verified",
          ),
        };
      }
      // "none": fall through and gate them the normal way below.
    }
  }

  // ---- Quarantine-until-verified ----
  // When a quarantine role is configured, hold every new member behind it so
  // they are gated until they press Verify.
  return {
    held: await quarantine(
      member,
      config.unverifiedRoleId,
      "New member: quarantined until verified",
    ),
  };
}
