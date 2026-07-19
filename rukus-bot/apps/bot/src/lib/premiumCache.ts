import { getSubscription, getUsage } from "@rukus/db";
import {
  PREMIUM_CHAR_LIMIT,
  isSubscriptionActive,
  periodStartFor,
  type PremiumState,
} from "@rukus/shared";
import { log } from "./logger.js";

/**
 * A short-TTL cache in front of the premium entitlement read.
 *
 * Premium is checked on the hot path (every message that might be translated),
 * so an uncached read would mean a round-trip to Postgres per message. The TTL
 * is much shorter than configCache's 15s because this decides who gets a paid
 * feature in both directions: a cancelled guild must stop billing us within
 * seconds, and a guild that just paid should not wait to use what they bought.
 *
 * Resilience differs from configCache in one important way. Config fails
 * OPEN-to-defaults (every feature defaults to off, so the bot degrades to doing
 * nothing). Entitlement fails CLOSED: if we cannot prove a guild has paid, they
 * do not get the metered engine. Serving a stale "active" through a database
 * outage would spend real money on DeepL characters for guilds that may have
 * cancelled, and the fallback (free Google translation) is a quality drop, not
 * an outage.
 */
const TTL_MS = 30_000;
/** After a failure, wait this long before hammering the DB again. */
const ERROR_BACKOFF_MS = 30_000;

/**
 * Cap the map. One key per guild on a public bot, so unbounded this is a slow
 * memory leak. Insertion order makes deleting the oldest key a cheap LRU
 * approximation: a quiet guild ages out and an active one is simply re-read.
 */
const MAX_ENTRIES = 5_000;

type Entry = { value: PremiumState; expires: number };
const cache = new Map<string, Entry>();
let lastErrorLoggedAt = 0;

function put(key: string, entry: Entry): void {
  // Re-insert so the key moves to the end (most recently used).
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function inactive(reason: string): PremiumState {
  return {
    active: false,
    reason,
    charactersUsed: 0,
    charactersLimit: PREMIUM_CHAR_LIMIT,
    renewsAt: null,
    cancelAtPeriodEnd: false,
  };
}

async function load(guildId: string): Promise<PremiumState> {
  const sub = await getSubscription(guildId);
  if (!sub) return inactive("No subscription");

  const now = new Date();
  const active = isSubscriptionActive(sub, now);
  if (!active) return inactive(`Subscription ${sub.status}`);

  const usage = await getUsage(guildId, periodStartFor(now));
  const charactersUsed = usage?.characters ?? 0;

  // Over quota is still "subscribed", but it is not "may spend a character".
  // Callers read `active`, so the quota has to fold into it here or the metered
  // engine would keep billing past the included allowance.
  if (charactersUsed >= PREMIUM_CHAR_LIMIT) {
    return {
      active: false,
      reason: "Monthly character limit reached",
      charactersUsed,
      charactersLimit: PREMIUM_CHAR_LIMIT,
      renewsAt: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  }

  return {
    active: true,
    reason: sub.manualUntil && sub.manualUntil > now ? "Comped" : "Subscribed",
    charactersUsed,
    charactersLimit: PREMIUM_CHAR_LIMIT,
    renewsAt: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

/**
 * This guild's current premium state. Never throws: a database blip on a
 * message event would otherwise surface as an unhandled rejection and take the
 * bot down.
 */
export async function premiumState(guildId: string): Promise<PremiumState> {
  const now = Date.now();
  const hit = cache.get(guildId);
  if (hit && hit.expires > now) return hit.value;

  try {
    const value = await load(guildId);
    put(guildId, { value, expires: now + TTL_MS });
    return value;
  } catch (err) {
    // Rate-limit the log so a sustained outage doesn't flood it.
    if (now - lastErrorLoggedAt > ERROR_BACKOFF_MS) {
      lastErrorLoggedAt = now;
      log.error(
        `Premium read failed for guild ${guildId} - treating as not premium. The bot stays up.`,
        err instanceof Error ? err.message : err,
      );
    }
    const value = inactive("Premium check unavailable");
    // Back off before retrying so we don't hit a downed DB on every message.
    put(guildId, { value, expires: now + ERROR_BACKOFF_MS });
    return value;
  }
}

/** Drop a guild's cached state, e.g. right after a successful checkout. */
export function invalidatePremium(guildId: string): void {
  cache.delete(guildId);
}
