import { prisma } from "@rukus/db";

/**
 * Cached per-channel ticket metadata.
 *
 * Used on the hot message path (auto-responder suppression, two-way
 * conversation translation), so it's one indexed unique query per channel per
 * TTL. Commands that change a ticket's settings call invalidateTicketMeta so
 * the change applies immediately.
 */
const TTL_MS = 5 * 60_000;
const CACHE_MAX = 500;

export interface TicketMeta {
  openerId: string;
  translateLang: string | null;
}

const cache = new Map<string, { value: TicketMeta | null; expires: number }>();

export async function getTicketMeta(
  channelId: string,
): Promise<TicketMeta | null> {
  const now = Date.now();
  const hit = cache.get(channelId);
  if (hit && hit.expires > now) return hit.value;

  let value: TicketMeta | null = null;
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { channelId },
      select: { openerId: true, translateLang: true, status: true },
    });
    if (ticket && ticket.status !== "CLOSED") {
      value = { openerId: ticket.openerId, translateLang: ticket.translateLang };
    }
  } catch {
    // DB blip: treat as not-a-ticket rather than suppressing features broadly.
    value = null;
  }

  cache.set(channelId, { value, expires: now + TTL_MS });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
}

/** True when the channel belongs to an open ticket. */
export async function isTicketChannel(channelId: string): Promise<boolean> {
  return (await getTicketMeta(channelId)) !== null;
}

/** Drop a channel's cached meta (call after changing ticket settings). */
export function invalidateTicketMeta(channelId: string): void {
  cache.delete(channelId);
}
