import type { Client, Guild, Invite } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { log } from "../../lib/logger.js";
import type { InviteSnapshot } from "./attribute.js";

/**
 * The invite-use snapshot, per guild.
 *
 * This is the entire trick behind invite tracking: Discord tells us a member
 * joined, but not how. It will however tell us how many times each invite has
 * been used, so if we hold yesterday's counts we can diff them against today's
 * and see which one ticked up. That means the cache MUST be primed before the
 * first join we care about, and re-primed whenever it could have drifted.
 *
 * Held in memory on purpose. It is a cache of Discord's own state, not a record
 * of anything: after a restart we simply re-fetch the truth from Discord. The
 * durable record of who invited whom is the InviteUse table.
 */

/** guildId -> code -> snapshot. */
const cache = new Map<string, Map<string, InviteSnapshot>>();

/** Guilds whose vanity URL use count we are watching, so we can spot vanity joins. */
const vanityUses = new Map<string, number | null>();

/** Can we even read this guild's invites? Without Manage Server, no. */
function canFetchInvites(guild: Guild): boolean {
  return (
    guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false
  );
}

function toSnapshot(invite: Invite): InviteSnapshot {
  return {
    code: invite.code,
    uses: invite.uses ?? 0,
    inviterId: invite.inviter?.id ?? null,
  };
}

/**
 * Pull the guild's invites from Discord and replace our snapshot.
 *
 * Also reads the vanity counter where the guild has one. A vanity URL does NOT
 * appear in the invite list, so without this a vanity join would look exactly
 * like a join we failed to track, and we would keep saying "I don't know" for
 * something we actually do know.
 */
export async function primeGuild(guild: Guild): Promise<void> {
  if (!canFetchInvites(guild)) {
    // Not an error: plenty of guilds simply do not grant Manage Server. Say it
    // once, quietly, rather than failing every join.
    cache.delete(guild.id);
    return;
  }

  try {
    const invites = await guild.invites.fetch();
    const snapshot = new Map<string, InviteSnapshot>();
    for (const invite of invites.values()) {
      snapshot.set(invite.code, toSnapshot(invite));
    }
    cache.set(guild.id, snapshot);
  } catch (err) {
    log.warn(`Could not cache invites for ${guild.id}: ${String(err)}`);
    return;
  }

  vanityUses.set(guild.id, await fetchVanityUses(guild));
}

/** The vanity URL's use count, or null if this guild has no vanity URL. */
async function fetchVanityUses(guild: Guild): Promise<number | null> {
  // Only boosted guilds have one, and asking without the feature is a guaranteed
  // 404 on every single prime and join.
  if (!guild.features.includes("VANITY_URL")) return null;
  const data = await guild.fetchVanityData().catch(() => null);
  return data?.uses ?? null;
}

/** Prime every guild we are in. Called once on ready. */
export async function primeAll(client: Client): Promise<void> {
  await Promise.all(
    [...client.guilds.cache.values()].map((g) =>
      primeGuild(g).catch(() => {}),
    ),
  );
  log.info(`Invite cache primed for ${cache.size} guild(s).`);
}

/** A new invite exists: record it at zero uses so the first use is a visible +1. */
export function rememberInvite(invite: Invite): void {
  const guildId = invite.guild && "id" in invite.guild ? invite.guild.id : null;
  if (!guildId) return;
  const snapshot = cache.get(guildId);
  // No snapshot means we never primed this guild (no Manage Server). Creating a
  // partial one here would be worse than none: the diff would see every OTHER
  // invite as brand new and the attribution would be nonsense.
  if (!snapshot) return;
  snapshot.set(invite.code, toSnapshot(invite));
}

/**
 * An invite is gone. Drop it, so `attribute()` cannot mistake a REVOKED invite
 * for a used-up one: a code missing from the fresh list but still in our cache
 * is treated as "consumed to its cap", and a revoked invite would be credited to
 * whoever happened to create it.
 */
export function forgetInvite(invite: Invite): void {
  const guildId = invite.guild && "id" in invite.guild ? invite.guild.id : null;
  if (!guildId) return;
  cache.get(guildId)?.delete(invite.code);
}

/** What we had cached for this guild, or null if we never primed it. */
export function snapshotOf(guildId: string): InviteSnapshot[] | null {
  const snapshot = cache.get(guildId);
  return snapshot ? [...snapshot.values()] : null;
}

/** The vanity use count we last saw, or null if the guild has no vanity URL. */
export function vanityOf(guildId: string): number | null {
  return vanityUses.get(guildId) ?? null;
}

/** Re-read the guild from Discord and hand back the fresh state plus the vanity count. */
export async function refresh(
  guild: Guild,
): Promise<{ invites: InviteSnapshot[]; vanity: number | null } | null> {
  if (!canFetchInvites(guild)) return null;

  try {
    const fetched = await guild.invites.fetch();
    const snapshot = new Map<string, InviteSnapshot>();
    for (const invite of fetched.values()) {
      snapshot.set(invite.code, toSnapshot(invite));
    }
    const vanity = await fetchVanityUses(guild);

    cache.set(guild.id, snapshot);
    vanityUses.set(guild.id, vanity);

    return { invites: [...snapshot.values()], vanity };
  } catch (err) {
    log.warn(`Could not refresh invites for ${guild.id}: ${String(err)}`);
    return null;
  }
}

/** The bot left, or the guild went away. Stop holding its state. */
export function dropGuild(guildId: string): void {
  cache.delete(guildId);
  vanityUses.delete(guildId);
}
