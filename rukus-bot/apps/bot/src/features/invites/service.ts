import { prisma } from "@rukus/db";

/**
 * The durable record: who invited whom. Unlike the invite cache, these rows
 * outlive a restart, because "you have brought in 12 members" is a claim people
 * build rewards on and it cannot be rebuilt from Discord's API after the fact.
 */

/** Record an attributed join. */
export async function recordInviteUse(
  guildId: string,
  inviterId: string,
  joinedUserId: string,
  code: string,
): Promise<void> {
  await prisma.inviteUse.create({
    data: { guildId, inviterId, joinedUserId, code },
  });
}

/** How many members this person has brought into the guild. */
export async function inviteCount(
  guildId: string,
  inviterId: string,
): Promise<number> {
  return prisma.inviteUse.count({ where: { guildId, inviterId } });
}

/** The guild's top inviters, most first. */
export async function topInviters(
  guildId: string,
  limit = 10,
): Promise<Array<{ inviterId: string; count: number }>> {
  const grouped = await prisma.inviteUse.groupBy({
    by: ["inviterId"],
    where: { guildId },
    _count: { inviterId: true },
    orderBy: { _count: { inviterId: "desc" } },
    take: limit,
  });

  return grouped.map((g) => ({
    inviterId: g.inviterId,
    count: g._count.inviterId,
  }));
}
