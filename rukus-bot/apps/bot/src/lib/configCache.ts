import {
  getTicketConfig,
  getFormsConfig,
  getTranslationConfig,
  getAutoResponderConfig,
  getModerationConfig,
} from "@rukus/db";
import {
  ticketConfigSchema,
  formsConfigSchema,
  translationConfigSchema,
  autoResponderConfigSchema,
  moderationConfigSchema,
  type TicketConfig,
  type FormsConfig,
  type TranslationConfig,
  type AutoResponderConfig,
  type ModerationConfig,
} from "@rukus/shared";
import { log } from "./logger.js";

/**
 * A tiny TTL cache in front of the config read helpers. Interaction handlers
 * fire constantly; without this every button click would round-trip to
 * Postgres. TTL is short so dashboard edits show up within seconds.
 *
 * The dashboard runs in a different process, so it can't invalidate this cache
 * directly - the TTL is our staleness bound. 15s is a fine tradeoff for config.
 *
 * Resilience: a config read must NEVER throw. A database blip on a message
 * event would otherwise bubble up as an unhandled rejection and kill the whole
 * bot. On failure we serve the last known value (stale beats dead), and if we
 * have none, the schema defaults - every feature defaults to disabled, so the
 * bot degrades to doing nothing rather than crashing.
 */
const TTL_MS = 15_000;
/** After a failure, wait this long before hammering the DB again. */
const ERROR_BACKOFF_MS = 30_000;

type Entry<T> = { value: T; expires: number };
const cache = new Map<string, Entry<unknown>>();
/** Last successful value per key, kept indefinitely as a fallback. */
const lastGood = new Map<string, unknown>();
let lastErrorLoggedAt = 0;

async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  fallback: () => T,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;

  try {
    const value = await loader();
    cache.set(key, { value, expires: now + TTL_MS });
    lastGood.set(key, value);
    return value;
  } catch (err) {
    // Rate-limit the log so a sustained outage doesn't flood it.
    if (now - lastErrorLoggedAt > ERROR_BACKOFF_MS) {
      lastErrorLoggedAt = now;
      log.error(
        `Config read failed for "${key}" - serving ${
          lastGood.has(key) ? "last known value" : "defaults"
        }. The bot stays up.`,
        err instanceof Error ? err.message : err,
      );
    }
    const stale = lastGood.get(key) as T | undefined;
    const value = stale ?? fallback();
    // Back off before retrying so we don't hit a downed DB on every message.
    cache.set(key, { value, expires: now + ERROR_BACKOFF_MS });
    return value;
  }
}

export const ticketConfig = (guildId: string): Promise<TicketConfig> =>
  cached(`tickets:${guildId}`, () => getTicketConfig(guildId), () =>
    ticketConfigSchema.parse({}),
  );

export const formsConfig = (guildId: string): Promise<FormsConfig> =>
  cached(`forms:${guildId}`, () => getFormsConfig(guildId), () =>
    formsConfigSchema.parse({}),
  );

export const translationConfig = (guildId: string): Promise<TranslationConfig> =>
  cached(`translation:${guildId}`, () => getTranslationConfig(guildId), () =>
    translationConfigSchema.parse({}),
  );

export const autoResponderConfig = (
  guildId: string,
): Promise<AutoResponderConfig> =>
  cached(`autoresponder:${guildId}`, () => getAutoResponderConfig(guildId), () =>
    autoResponderConfigSchema.parse({}),
  );

export const moderationConfig = (guildId: string): Promise<ModerationConfig> =>
  cached(`moderation:${guildId}`, () => getModerationConfig(guildId), () =>
    moderationConfigSchema.parse({}),
  );

/** Drop a guild's cached entries (e.g. after an in-bot config command). */
export function invalidate(guildId: string): void {
  for (const key of cache.keys()) {
    if (key.endsWith(`:${guildId}`)) cache.delete(key);
  }
}
