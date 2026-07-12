import { prisma } from "@rukus/db";

/**
 * Cached "is this channel a ticket?" lookup.
 *
 * Used by features that must behave differently inside tickets (the
 * auto-responder suggesting "open a support ticket" INSIDE a ticket was
 * peak comedy). The lookup is one indexed unique query, cached for 5 minutes
 * per channel so busy channels never repeat it.
 */
const TTL_MS = 5 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { value: boolean; expires: number }>();

export async function isTicketChannel(channelId: string): Promise<boolean> {
  const now = Date.now();
  const hit = cache.get(channelId);
  if (hit && hit.expires > now) return hit.value;

  let value = false;
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { channelId },
      select: { id: true },
    });
    value = ticket !== null;
  } catch {
    // DB blip: assume not a ticket rather than suppressing features broadly.
    value = false;
  }

  cache.set(channelId, { value, expires: now + TTL_MS });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
}
