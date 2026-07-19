import { getSupabase } from "@rukus/supabase";

/**
 * The balance leaderboard, read straight from Supabase.
 *
 * Mirrors getLeaderboardRows in @rukus/supabase (which serves the leveling
 * page) rather than importing it, because that helper is shaped around
 * MemberLevel. The bot writes these rows through Prisma; we only ever read.
 *
 * `amount` and `lifetime` are BigInt columns, so PostgREST hands them back as
 * strings to avoid the precision loss a JS number would cause past 2^53. They
 * are converted to bigint here and formatted at the edge, never parsed into a
 * number.
 */

export interface BalanceRow {
  userId: string;
  amount: bigint;
  lifetime: bigint;
  dailyStreak: number;
}

export async function getBalanceRows(
  guildId: string,
  limit = 100,
): Promise<BalanceRow[]> {
  const { data, error } = await getSupabase()
    .from("Balance")
    .select("userId, amount, lifetime, dailyStreak")
    .eq("guildId", guildId)
    .order("amount", { ascending: false })
    .limit(limit);

  // A missing table (migration not run yet) must not 500 the settings page the
  // admin came here to edit; an empty list is the honest degraded view.
  if (error) return [];

  return (data ?? []).map((r) => ({
    userId: r.userId,
    amount: toBigInt(r.amount),
    lifetime: toBigInt(r.lifetime),
    dailyStreak: r.dailyStreak ?? 0,
  }));
}

/** PostgREST returns BigInt columns as strings; tolerate either shape. */
function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  return 0n;
}
