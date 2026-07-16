import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Role,
} from "discord.js";
import type { VerificationConfig } from "@rukus/shared";
import { log } from "../../lib/logger.js";

/**
 * Verification domain logic: the role-grant that clears a member, the join gate,
 * and the tiny in-memory store for pending captcha codes.
 *
 * Every Discord write here reports WHY it failed (missing Manage Roles, a role
 * above the bot) so an admin gets a clear message instead of a silent log line,
 * the rule mod actions follow elsewhere in the bot.
 */

/** Can the bot actually hand out this role right now, and if not, why not. */
export function checkRoleGrantable(
  guild: Guild,
  roleId: string | undefined,
): { ok: true; role: Role } | { ok: false; reason: string } {
  if (!roleId) return { ok: false, reason: "No verified role is set." };
  const me = guild.members.me;
  if (!me) return { ok: false, reason: "I can't see my own membership here." };
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, reason: "I'm missing the **Manage Roles** permission." };
  }
  const role = guild.roles.cache.get(roleId);
  if (!role) return { ok: false, reason: "The verified role no longer exists." };
  if (role.managed) {
    return {
      ok: false,
      reason: `<@&${role.id}> is managed by an integration and can't be assigned.`,
    };
  }
  if (role.position >= me.roles.highest.position) {
    return {
      ok: false,
      reason: `<@&${role.id}> is above my highest role. Drag my role above it in **Server Settings > Roles**.`,
    };
  }
  return { ok: true, role };
}

export interface VerifyOutcome {
  ok: boolean;
  /** Member-facing message. */
  message: string;
}

/**
 * Grant the verified role and drop the quarantine role. Assumes the caller
 * already screened the config with checkRoleGrantable when it needs to; this
 * still re-checks so a direct call can't grant a role the bot can't manage.
 */
export async function verifyMember(
  member: GuildMember,
  config: VerificationConfig,
): Promise<VerifyOutcome> {
  const grantable = checkRoleGrantable(member.guild, config.verifiedRoleId);
  if (!grantable.ok) {
    return {
      ok: false,
      message: `I couldn't verify you: ${grantable.reason} Please tell an admin.`,
    };
  }

  if (member.roles.cache.has(grantable.role.id)) {
    return { ok: true, message: "You're already verified. You're all set!" };
  }

  try {
    await member.roles.add(grantable.role.id, "Verification passed");
  } catch (err) {
    log.warn(`Verify grant failed in ${member.guild.id}: ${String(err)}`);
    return {
      ok: false,
      message: "Something went wrong granting your role. Please tell an admin.",
    };
  }

  // Best-effort: dropping quarantine must not fail the verify itself.
  if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) {
    await member.roles
      .remove(config.unverifiedRoleId, "Verification passed")
      .catch((e) => log.warn(`Unverified-role removal failed: ${String(e)}`));
  }

  return { ok: true, message: "✅ You're verified. Welcome in!" };
}

// ---------------- Captcha codes ----------------

/**
 * Pending captcha challenges, keyed by `${guildId}:${userId}`.
 *
 * BOUNDED and self-evicting: a code expires after CODE_TTL_MS and is pruned on
 * every access, and the map is hard-capped so a flood of Verify clicks can't
 * grow it without limit (the leak the house rules call out). A dropped code just
 * means the member clicks Verify again.
 */
const CODE_TTL_MS = 5 * 60_000;
const MAX_CODES = 5_000;
/** Unambiguous alphabet: no 0/O, 1/I/L. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

interface Challenge {
  code: string;
  expires: number;
}
const challenges = new Map<string, Challenge>();

function codeKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

/** Drop expired entries, then trim to the cap oldest-first. */
function pruneChallenges(): void {
  const now = Date.now();
  for (const [key, ch] of challenges) {
    if (ch.expires <= now) challenges.delete(key);
  }
  while (challenges.size > MAX_CODES) {
    const oldest = challenges.keys().next().value;
    if (oldest === undefined) break;
    challenges.delete(oldest);
  }
}

export function issueCaptcha(guildId: string, userId: string): string {
  pruneChallenges();
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  challenges.set(codeKey(guildId, userId), {
    code,
    expires: Date.now() + CODE_TTL_MS,
  });
  return code;
}

/**
 * True if `answer` matches the member's outstanding code. Consumes the code on a
 * correct answer so it can't be replayed. Case-insensitive and whitespace-tolerant.
 */
export function checkCaptcha(
  guildId: string,
  userId: string,
  answer: string,
): boolean {
  pruneChallenges();
  const key = codeKey(guildId, userId);
  const ch = challenges.get(key);
  if (!ch) return false;
  const normalised = answer.replace(/\s+/g, "").toUpperCase();
  if (normalised !== ch.code) return false;
  challenges.delete(key);
  return true;
}
