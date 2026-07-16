import { fetchGuildMembers } from "@/lib/discord";

/**
 * Turn a set of user ids into display names for the dashboard tables.
 *
 * Tables like Cases, Reminders and the leaderboard store only ids, and showing
 * a raw snowflake to staff is useless. Discord has no batch-user endpoint, so
 * resolving one id at a time would be one REST call per row (slow, and a fast
 * route to a 429). Instead we reuse fetchGuildMembers, which pulls a single
 * cached page of the guild's members, and index it in memory.
 *
 * Members missing from that page (they left, or sit past the first 1000) fall
 * back to a short id label rather than costing an extra request. The caller is
 * always an authed dashboard server component, so this never runs for anon
 * visitors.
 */
export async function resolveMemberNames(
  guildId: string,
  userIds: Iterable<string>,
): Promise<Map<string, string>> {
  const wanted = new Set(userIds);
  const out = new Map<string, string>();
  if (wanted.size === 0) return out;

  const members = await fetchGuildMembers(guildId).catch(() => []);
  for (const m of members) {
    if (wanted.has(m.id)) out.set(m.id, m.name);
  }

  // Anyone we could not resolve gets a compact fallback so the cell is never
  // empty and the id is still copyable for a manual lookup.
  for (const id of wanted) {
    if (!out.has(id)) out.set(id, `Unknown (${id})`);
  }
  return out;
}
