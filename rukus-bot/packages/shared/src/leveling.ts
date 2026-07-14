/**
 * Pure leveling math.
 *
 * This lives in `shared` rather than the bot because the dashboard renders the
 * same progress bars and the same "xp to next level" numbers the bot announces.
 * If the two ever disagreed, staff would be looking at a leaderboard that
 * contradicts what members see in /rank.
 *
 * The curve is MEE6's, deliberately: it is the de facto standard, so a server
 * migrating from MEE6 (or Carl-bot, which copies it) keeps everyone's level.
 *   xp to go from level n to n+1 = 5*n^2 + 50*n + 100
 * Nothing here touches discord.js or the network.
 */

/** XP needed to advance FROM `level` to `level + 1`. */
export function xpForNextLevel(level: number): number {
  const n = Math.max(0, Math.floor(level));
  return 5 * n * n + 50 * n + 100;
}

/**
 * Total XP required to have REACHED `level` from zero.
 * Closed form of the running sum, so a level-500 lookup costs the same as
 * level 1 (the dashboard renders whole leaderboards of these).
 */
export function xpForLevel(level: number): number {
  const n = Math.max(0, Math.floor(level));
  if (n === 0) return 0;
  const m = n - 1;
  // Sum over k = 0..m of (5k^2 + 50k + 100).
  return (
    (5 * m * (m + 1) * (2 * m + 1)) / 6 + (50 * m * (m + 1)) / 2 + 100 * n
  );
}

/** The level a member with this much cumulative XP has reached. */
export function levelFromXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 0;
  let spent = 0;
  // Levels grow fast enough that this converges in a handful of steps even for
  // absurd XP totals; the cap stops a corrupt row from hanging the process.
  while (level < 1000) {
    const next = spent + xpForNextLevel(level);
    if (next > xp) break;
    spent = next;
    level++;
  }
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP earned since reaching `level`. */
  currentXp: number;
  /** XP the member needs to earn while at `level` to reach the next one. */
  neededXp: number;
  /** 0..1, how far through the current level they are. */
  ratio: number;
  totalXp: number;
}

/** Everything /rank and the dashboard progress bar need, from one XP number. */
export function levelProgress(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  const level = levelFromXp(xp);
  const currentXp = xp - xpForLevel(level);
  const neededXp = xpForNextLevel(level);
  return {
    level,
    currentXp,
    neededXp,
    ratio: neededXp > 0 ? Math.min(1, currentXp / neededXp) : 0,
    totalXp: xp,
  };
}

/**
 * A text progress bar for the /rank embed. Discord has no native progress bar,
 * and an image would mean shipping canvas into the bot for one command.
 */
export function progressBar(ratio: number, width = 20): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/**
 * Roll the XP awarded for one message and apply the member's best multiplier.
 *
 * Multipliers do NOT stack: a member with both a booster (x2) and a patron (x3)
 * role gets x3, not x6. Stacking makes the top of the leaderboard a function of
 * how many perk roles someone collected rather than how much they talked.
 */
export function rollXp(
  min: number,
  max: number,
  multipliers: number[],
  random: () => number = Math.random,
): number {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(0, Math.max(min, max));
  const base = lo + Math.floor(random() * (hi - lo + 1));
  const best = multipliers.length > 0 ? Math.max(...multipliers) : 1;
  return Math.max(0, Math.round(base * best));
}

/**
 * Which reward roles a member should hold at `level`.
 *
 * When rewards don't stack, only the highest earned reward survives, which is
 * what a ladder of colored rank roles wants. `remove` is what must be taken
 * away, so the caller never has to diff the lists itself.
 */
export function rewardRolesFor(
  level: number,
  rewards: { level: number; roleId: string }[],
  stack: boolean,
): { add: string[]; remove: string[] } {
  const earned = rewards.filter((r) => r.level <= level);
  if (earned.length === 0) return { add: [], remove: [] };

  const sorted = [...earned].sort((a, b) => a.level - b.level);
  if (stack) {
    return { add: [...new Set(sorted.map((r) => r.roleId))], remove: [] };
  }

  const top = sorted[sorted.length - 1]!.roleId;
  // Every other reward role in the ladder is stale, including ones from levels
  // above them: a manual /xp set that drops someone down should demote them.
  const remove = [
    ...new Set(rewards.map((r) => r.roleId).filter((id) => id !== top)),
  ];
  return { add: [top], remove };
}

/** Fill {user}, {username}, {level}, {server} in a level-up announcement. */
export function renderLevelUp(
  template: string,
  ctx: { userId: string; username: string; level: number; serverName: string },
): string {
  return template
    .replace(/\{user\}/gi, `<@${ctx.userId}>`)
    .replace(/\{username\}/gi, ctx.username)
    .replace(/\{level\}/gi, String(ctx.level))
    .replace(/\{server\}/gi, ctx.serverName);
}
