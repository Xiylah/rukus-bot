/**
 * Per-guild join-timestamp tracking for raid detection.
 *
 * BOUNDED and self-evicting, the non-negotiable house rule for in-memory maps:
 *
 *  - Each guild keeps a pruned array of recent join epochs. On every join we
 *    drop timestamps older than the window BEFORE checking the rate, so an
 *    array never grows past the joins that landed inside one window.
 *  - The outer map is capped: once past MAX_GUILDS we evict the guild whose
 *    most recent join is oldest. A guild that stops receiving joins ages out;
 *    an active one is simply re-seeded on its next join.
 *
 * This holds only volatile detection state (recent join times). Whether a raid
 * is actually ACTIVE, and what it locked, lives in the durable state module so a
 * redeploy cannot lose an in-progress lockdown.
 */

const MAX_GUILDS = 5_000;
/** Never retain more join times than the largest window could ever need. */
const MAX_PER_GUILD = 500;

interface GuildJoins {
  /** Ascending epoch ms of recent joins, and the ids that landed in the window. */
  times: number[];
  ids: string[];
}

const joinsByGuild = new Map<string, GuildJoins>();

/** Evict the guild whose newest join is oldest, an LRU by activity. */
function evictIfNeeded(): void {
  while (joinsByGuild.size > MAX_GUILDS) {
    let oldestKey: string | undefined;
    let oldestNewest = Infinity;
    for (const [key, entry] of joinsByGuild) {
      const newest = entry.times[entry.times.length - 1] ?? 0;
      if (newest < oldestNewest) {
        oldestNewest = newest;
        oldestKey = key;
      }
    }
    if (oldestKey === undefined) break;
    joinsByGuild.delete(oldestKey);
  }
}

export interface JoinWindow {
  /** How many joins landed within the window, including this one. */
  count: number;
  /** The member ids that landed within the window (most recent first ordering not guaranteed). */
  ids: string[];
}

/**
 * Record a join and return the joins still inside the window. Prunes anything
 * older than `windowSeconds` first, so the returned count is exactly "joins in
 * the last N seconds".
 */
export function recordJoin(
  guildId: string,
  userId: string,
  windowSeconds: number,
): JoinWindow {
  const now = Date.now();
  const cutoff = now - windowSeconds * 1000;

  let entry = joinsByGuild.get(guildId);
  if (!entry) {
    entry = { times: [], ids: [] };
    joinsByGuild.set(guildId, entry);
  } else {
    // Re-insert so this guild is treated as most-recently-active for eviction.
    joinsByGuild.delete(guildId);
    joinsByGuild.set(guildId, entry);
  }

  entry.times.push(now);
  entry.ids.push(userId);

  // Prune everything older than the window. times[] is ascending, so find the
  // first index still inside it and drop the prefix from both arrays together.
  let start = 0;
  while (start < entry.times.length && entry.times[start]! < cutoff) start++;
  if (start > 0) {
    entry.times.splice(0, start);
    entry.ids.splice(0, start);
  }

  // Hard cap per guild: keep only the newest MAX_PER_GUILD.
  if (entry.times.length > MAX_PER_GUILD) {
    const overflow = entry.times.length - MAX_PER_GUILD;
    entry.times.splice(0, overflow);
    entry.ids.splice(0, overflow);
  }

  evictIfNeeded();

  return { count: entry.times.length, ids: [...entry.ids] };
}

/** Forget a guild's join window, e.g. right after a raid trips so it re-arms clean. */
export function resetJoins(guildId: string): void {
  joinsByGuild.delete(guildId);
}
