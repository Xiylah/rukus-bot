import type { Guild, GuildMember } from "discord.js";
import { prisma } from "@rukus/db";
import { levelFromXp, rewardRolesFor, type LevelingConfig } from "@rukus/shared";
import { log } from "../../lib/logger.js";

/**
 * The XP store and the level-up side effects.
 *
 * All of the arithmetic lives in @rukus/shared; this file is only the part that
 * needs Prisma and discord.js. Splitting it that way is what lets the dashboard
 * show the same level for the same XP without importing the bot.
 */

export interface XpResult {
  xp: number;
  level: number;
  /** Set only when this award crossed a level boundary. */
  leveledUpTo: number | null;
}

/**
 * Add XP to a member and return their new standing.
 *
 * The read-then-write is done in a single UPDATE with an `increment` so two
 * messages racing in different channels can't both read the same old XP and
 * clobber each other, which would silently lose XP on busy servers.
 */
export async function addXp(
  guildId: string,
  userId: string,
  amount: number,
): Promise<XpResult> {
  const row = await prisma.memberLevel.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: {
      guildId,
      userId,
      xp: Math.max(0, amount),
      level: levelFromXp(Math.max(0, amount)),
      messages: 1,
      lastXpAt: new Date(),
    },
    update: {
      xp: { increment: amount },
      messages: { increment: 1 },
      lastXpAt: new Date(),
    },
  });

  const level = levelFromXp(row.xp);
  const leveledUp = level > row.level;

  // `level` is denormalized so the leaderboard can render without recomputing
  // the curve for every row; keep it in step with the XP that just landed.
  if (leveledUp || row.level !== level) {
    await prisma.memberLevel.update({
      where: { guildId_userId: { guildId, userId } },
      data: { level },
    });
  }

  return { xp: row.xp, level, leveledUpTo: leveledUp ? level : null };
}

/** Overwrite a member's XP outright (the /xp set path). */
export async function setXp(
  guildId: string,
  userId: string,
  xp: number,
): Promise<XpResult> {
  const clamped = Math.max(0, Math.floor(xp));
  const level = levelFromXp(clamped);
  await prisma.memberLevel.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, xp: clamped, level },
    update: { xp: clamped, level },
  });
  return { xp: clamped, level, leveledUpTo: null };
}

/** Whether this member is still inside their XP cooldown window. */
export async function onCooldown(
  guildId: string,
  userId: string,
  cooldownSec: number,
): Promise<boolean> {
  if (cooldownSec <= 0) return false;
  const row = await prisma.memberLevel.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { lastXpAt: true },
  });
  if (!row) return false;
  return Date.now() - row.lastXpAt.getTime() < cooldownSec * 1000;
}

export interface RankRow {
  userId: string;
  xp: number;
  level: number;
  messages: number;
}

/** A member's row plus their 1-based position in the guild. */
export async function getRank(
  guildId: string,
  userId: string,
): Promise<{ row: RankRow; rank: number; total: number } | null> {
  const row = await prisma.memberLevel.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  if (!row) return null;

  const [ahead, total] = await Promise.all([
    prisma.memberLevel.count({ where: { guildId, xp: { gt: row.xp } } }),
    prisma.memberLevel.count({ where: { guildId } }),
  ]);

  return {
    row: { userId: row.userId, xp: row.xp, level: row.level, messages: row.messages },
    rank: ahead + 1,
    total,
  };
}

/** One page of the leaderboard, highest XP first. */
export async function getLeaderboard(
  guildId: string,
  page: number,
  perPage = 10,
): Promise<{ rows: RankRow[]; total: number; pages: number }> {
  const total = await prisma.memberLevel.count({ where: { guildId } });
  const pages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), pages);

  const rows = await prisma.memberLevel.findMany({
    where: { guildId },
    orderBy: { xp: "desc" },
    skip: (safePage - 1) * perPage,
    take: perPage,
  });

  return {
    rows: rows.map((r) => ({
      userId: r.userId,
      xp: r.xp,
      level: r.level,
      messages: r.messages,
    })),
    total,
    pages,
  };
}

/**
 * Bring a member's reward roles in line with the level they just reached.
 *
 * Silently no-ops on roles the bot cannot manage (higher than its own top role,
 * or deleted since being configured): a level-up should never fail loudly at a
 * member because staff mis-ordered the role list.
 */
export async function applyRoleRewards(
  member: GuildMember,
  config: LevelingConfig,
  level: number,
): Promise<string[]> {
  if (config.roleRewards.length === 0) return [];

  const { add, remove } = rewardRolesFor(
    level,
    config.roleRewards,
    config.stackRoleRewards,
  );

  const granted: string[] = [];
  const manageable = (roleId: string) => {
    const role = member.guild.roles.cache.get(roleId);
    return role ? role.editable : false;
  };

  for (const roleId of add) {
    if (member.roles.cache.has(roleId) || !manageable(roleId)) continue;
    try {
      await member.roles.add(roleId, "Level reward");
      granted.push(roleId);
    } catch (err) {
      log.warn(`Leveling: could not grant role ${roleId}: ${String(err)}`);
    }
  }

  for (const roleId of remove) {
    if (!member.roles.cache.has(roleId) || !manageable(roleId)) continue;
    try {
      await member.roles.remove(roleId, "Level reward superseded");
    } catch (err) {
      log.warn(`Leveling: could not remove role ${roleId}: ${String(err)}`);
    }
  }

  return granted;
}

/** Resolve the configured announce channel, or null to reply in-place. */
export function announceChannel(guild: Guild, config: LevelingConfig) {
  if (!config.announceChannelId) return null;
  const channel = guild.channels.cache.get(config.announceChannelId);
  return channel?.isTextBased() && channel.isSendable() ? channel : null;
}
