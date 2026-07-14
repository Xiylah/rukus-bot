import type { Client, Guild, Role } from "discord.js";
import { birthdaysConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import { localNow, type LocalDay } from "./dates.js";
import { birthdaysOn } from "./service.js";

/**
 * Announces birthdays once a day, per guild, at the guild's own local hour.
 *
 * A polling sweeper rather than a scheduled timer, for the usual reason: a
 * Railway redeploy kills every in-process timer, and a birthday that silently
 * did not happen is not recoverable the next day. We wake up every few minutes,
 * ask each guild what its local date and hour are, and act when the hour has
 * arrived.
 *
 * WHY the birthday ROLE is the source of truth for cleanup, not a database
 * column: the role is state that survives our process dying, and it is also the
 * only state that actually matters (a member wearing a birthday hat a day late
 * is the visible bug). So "take the role off anyone who is wearing it and whose
 * birthday is not today" is self-healing: it fixes itself after downtime, after
 * a manual grant by staff, and after a config change, with no extra table.
 */

const SWEEP_INTERVAL_MS = 5 * 60_000;

/**
 * Guilds already announced today, keyed `guildId:YYYY-M-D` of the guild's OWN
 * local day. Purely an in-process guard against announcing twice inside one
 * five-minute window; if the bot restarts mid-day a guild could be announced a
 * second time, so we ALSO check the role before posting (see announce()), which
 * is the restart-safe half of the check.
 */
const announced = new Set<string>();

function dayKey(guildId: string, today: LocalDay): string {
  return `${guildId}:${today.year}-${today.month}-${today.day}`;
}

/** Fill the announcement template. Never exposes an age: we do not read `year`. */
function renderMessage(
  template: string,
  guild: Guild,
  userIds: string[],
): string {
  const mentions = userIds.map((id) => `<@${id}>`).join(", ");
  const names = userIds
    .map((id) => guild.members.cache.get(id)?.displayName ?? "someone")
    .join(", ");
  return template
    .replace(/\{user\}/gi, mentions)
    .replace(/\{username\}/gi, names)
    .replace(/\{server\}/gi, guild.name);
}

/** The birthday role, but only if we can actually manage it. */
function usableRole(guild: Guild, roleId: string | undefined): Role | null {
  if (!roleId) return null;
  const role = guild.roles.cache.get(roleId);
  if (!role) return null;
  const me = guild.members.me;
  if (!me?.permissions.has("ManageRoles")) return null;
  // A role above our own is not ours to hand out, and trying is a 403 per member.
  if (role.managed || role.position >= me.roles.highest.position) return null;
  return role;
}

/** Hand the birthday role to today's members and take it off everyone else. */
async function syncRole(
  guild: Guild,
  role: Role,
  celebrantIds: Set<string>,
): Promise<void> {
  // Members who hold the role are cached on the role itself, so no fetch needed
  // beyond what the members intent already gives us.
  for (const member of role.members.values()) {
    if (celebrantIds.has(member.id)) continue;
    await member.roles
      .remove(role, "Their birthday is over")
      .catch((e) => log.warn(`Birthday role removal failed for ${member.id}: ${String(e)}`));
  }

  for (const userId of celebrantIds) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || member.roles.cache.has(role.id)) continue;
    await member.roles
      .add(role, "It is their birthday")
      .catch((e) => log.warn(`Birthday role grant failed for ${userId}: ${String(e)}`));
  }
}

/** One guild's daily pass. */
async function sweepGuild(guild: Guild): Promise<void> {
  const config = await birthdaysConfig(guild.id);
  if (!config.enabled) return;

  const today = localNow(config.timezone);
  const role = usableRole(guild, config.birthdayRoleId);

  const celebrants = await birthdaysOn(guild.id, today);
  const celebrantIds = new Set(celebrants.map((b) => b.userId));

  // Role cleanup runs on EVERY pass, not only at the announce hour. Yesterday's
  // celebrants must lose the role as soon as their local day rolls over, and
  // waiting until the announce hour would leave them wearing it for hours.
  if (role) await syncRole(guild, role, celebrantIds);

  if (today.hour < config.announceHour) return;

  const key = dayKey(guild.id, today);
  if (announced.has(key)) return;
  announced.add(key);
  // The set is keyed by day, so yesterday's entries are dead weight. Guilds are
  // swept together, so a plain size cap is enough to keep it from growing.
  if (announced.size > 10_000) announced.clear();

  if (celebrants.length === 0) return;
  if (!config.channelId) return;

  const channel = guild.channels.cache.get(config.channelId);
  if (!channel?.isSendable()) return;

  await channel
    .send({
      content: renderMessage(config.message, guild, [...celebrantIds]).slice(0, 2000),
      allowedMentions: { users: [...celebrantIds].slice(0, 100) },
    })
    .catch((e) => log.warn(`Birthday announcement failed in ${guild.id}: ${String(e)}`));
}

/** One pass over every guild the bot serves. */
export async function sweepBirthdays(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      await sweepGuild(guild);
    } catch (err) {
      log.error(`Birthday sweep failed for guild ${guild.id}:`, err);
    }
  }
}

/** Start the recurring sweep. */
export function startBirthdaySweeper(client: Client): void {
  setTimeout(() => void sweepBirthdays(client), 20_000);
  setInterval(() => void sweepBirthdays(client), SWEEP_INTERVAL_MS);
  log.info("Birthday sweeper started (every 5m).");
}
