import { prisma } from "@rukus/db";
import { daysUntil, isBirthdayToday, type LocalDay } from "./dates.js";

/**
 * Storage for birthdays. One row per member per guild.
 *
 * The birth YEAR is stored but never rendered anywhere. A member's age is
 * sensitive (it is the difference between "a person" and "a minor"), and the
 * point of the optional year is that a server can compute an age if it ever
 * genuinely needs one, not that the bot broadcasts it. Nothing in this feature
 * reads `year` back out, and that is deliberate: see redact() below, which is
 * the only shape the rest of the bot ever sees.
 */

/** A birthday with the year deliberately stripped off. */
export interface PublicBirthday {
  userId: string;
  day: number;
  month: number;
}

/** The only projection of a Birthday row we ever hand out. */
function redact(row: { userId: string; day: number; month: number }): PublicBirthday {
  return { userId: row.userId, day: row.day, month: row.month };
}

/** Save (or replace) someone's birthday. */
export async function setBirthday(
  guildId: string,
  userId: string,
  day: number,
  month: number,
  year: number | null,
): Promise<void> {
  await prisma.birthday.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, day, month, year },
    update: { day, month, year },
  });
}

/** Forget someone's birthday. Returns false if there was nothing to forget. */
export async function removeBirthday(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const deleted = await prisma.birthday.deleteMany({
    where: { guildId, userId },
  });
  return deleted.count > 0;
}

/** One member's birthday, year already stripped. */
export async function getBirthday(
  guildId: string,
  userId: string,
): Promise<PublicBirthday | null> {
  const row = await prisma.birthday.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { userId: true, day: true, month: true },
  });
  return row ? redact(row) : null;
}

/**
 * The next `limit` birthdays coming up, soonest first.
 *
 * Sorting happens in memory rather than in SQL because "soonest" wraps around
 * the end of the year, which is not something a plain ORDER BY month, day can
 * express. Guilds are small enough that pulling the rows is cheap.
 */
export async function upcomingBirthdays(
  guildId: string,
  today: LocalDay,
  limit = 15,
): Promise<Array<PublicBirthday & { inDays: number }>> {
  const rows = await prisma.birthday.findMany({
    where: { guildId },
    select: { userId: true, day: true, month: true },
    take: 1000,
  });

  return rows
    .map((r) => ({ ...redact(r), inDays: daysUntil(r, today) }))
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, limit);
}

/** Everyone in this guild whose birthday falls on `today`. */
export async function birthdaysOn(
  guildId: string,
  today: LocalDay,
): Promise<PublicBirthday[]> {
  // The index is on (guildId, month, day), so fetch both candidate days and let
  // isBirthdayToday() decide: it owns the 29 February rule, and duplicating that
  // rule in a query is how the two drift apart.
  const rows = await prisma.birthday.findMany({
    where: { guildId, month: today.month, day: { in: [today.day, 29] } },
    select: { userId: true, day: true, month: true },
  });

  return rows.filter((r) => isBirthdayToday(r, today)).map(redact);
}
