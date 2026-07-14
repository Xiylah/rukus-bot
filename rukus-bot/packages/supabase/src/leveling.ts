import { getSupabase } from "./index.js";

/**
 * Dashboard read for the XP leaderboard.
 *
 * This does not live in config.ts: that file is exclusively the FeatureConfig
 * JSON blob table. MemberLevel is real per-member data, so it gets its own door.
 * The bot writes these rows through Prisma; we only ever read them here.
 */

export interface LeaderboardRow {
  userId: string;
  xp: number;
  level: number;
  messages: number;
}

export async function getLeaderboardRows(
  guildId: string,
  limit = 100,
): Promise<LeaderboardRow[]> {
  const { data, error } = await getSupabase()
    .from("MemberLevel")
    .select("userId, xp, level, messages")
    .eq("guildId", guildId)
    .order("xp", { ascending: false })
    .limit(limit);

  // A missing table (migration not run yet) must not 500 the settings page the
  // admin came here to edit; an empty leaderboard is the honest degraded view.
  if (error) return [];

  return (data ?? []).map((r) => ({
    userId: r.userId,
    xp: r.xp ?? 0,
    level: r.level ?? 0,
    messages: r.messages ?? 0,
  }));
}

/**
 * One page of the leaderboard, plus the total row count.
 *
 * The public /leaderboard page pages through the top 100, so it needs an offset
 * and the total to render "page 2 of 5" without pulling every row in the guild.
 */
export async function getLeaderboardPage(
  guildId: string,
  offset: number,
  limit: number,
): Promise<{ rows: LeaderboardRow[]; total: number }> {
  const { data, error, count } = await getSupabase()
    .from("MemberLevel")
    .select("userId, xp, level, messages", { count: "exact" })
    .eq("guildId", guildId)
    .order("xp", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return { rows: [], total: 0 };

  return {
    rows: (data ?? []).map((r) => ({
      userId: r.userId,
      xp: r.xp ?? 0,
      level: r.level ?? 0,
      messages: r.messages ?? 0,
    })),
    total: count ?? 0,
  };
}
