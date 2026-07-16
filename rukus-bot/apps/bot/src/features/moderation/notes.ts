import { prisma } from "@rukus/db";

/**
 * User notes: private staff context about a member, distinct from warnings.
 * A note never DMs the member and never shows up in /history; it is the "read
 * the room before you act" scratchpad staff leave for each other, stored in the
 * UserNote table.
 *
 * Every query is scoped by guildId: the bot is public, and one guild's notes
 * must never leak into another's.
 */

export const MAX_NOTE_LENGTH = 1000;

export function addNote(
  guildId: string,
  userId: string,
  authorId: string,
  note: string,
) {
  return prisma.userNote.create({
    data: { guildId, userId, authorId, note: note.slice(0, MAX_NOTE_LENGTH) },
  });
}

export function listNotes(guildId: string, userId: string) {
  return prisma.userNote.findMany({
    where: { guildId, userId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
}

/** How many notes a member has, for the /history header hint. */
export function countNotes(guildId: string, userId: string) {
  return prisma.userNote.count({ where: { guildId, userId } });
}

/**
 * Remove a single note by id, scoped to the guild so a crafted id from another
 * server cannot delete a note here. Returns true when a row was removed.
 */
export async function removeNote(guildId: string, id: string): Promise<boolean> {
  const res = await prisma.userNote.deleteMany({ where: { id, guildId } });
  return res.count > 0;
}

/** Wipe every note for a member. Returns how many were removed. */
export async function clearNotes(
  guildId: string,
  userId: string,
): Promise<number> {
  const res = await prisma.userNote.deleteMany({ where: { guildId, userId } });
  return res.count;
}
