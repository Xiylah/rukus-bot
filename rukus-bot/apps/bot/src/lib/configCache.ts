import {
  getTicketConfig,
  getFormsConfig,
  getTranslationConfig,
  getAutoResponderConfig,
  getModerationConfig,
} from "@rukus/db";
import type {
  TicketConfig,
  FormsConfig,
  TranslationConfig,
  AutoResponderConfig,
  ModerationConfig,
} from "@rukus/shared";

/**
 * A tiny TTL cache in front of the config read helpers. Interaction handlers
 * fire constantly; without this every button click would round-trip to
 * Postgres. TTL is short so dashboard edits show up within seconds.
 *
 * The dashboard runs in a different process, so it can't invalidate this cache
 * directly — the TTL is our staleness bound. 15s is a fine tradeoff for config.
 */
const TTL_MS = 15_000;

type Entry<T> = { value: T; expires: number };
const cache = new Map<string, Entry<unknown>>();

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  const value = await loader();
  cache.set(key, { value, expires: now + TTL_MS });
  return value;
}

export const ticketConfig = (guildId: string): Promise<TicketConfig> =>
  cached(`tickets:${guildId}`, () => getTicketConfig(guildId));

export const formsConfig = (guildId: string): Promise<FormsConfig> =>
  cached(`forms:${guildId}`, () => getFormsConfig(guildId));

export const translationConfig = (guildId: string): Promise<TranslationConfig> =>
  cached(`translation:${guildId}`, () => getTranslationConfig(guildId));

export const autoResponderConfig = (
  guildId: string,
): Promise<AutoResponderConfig> =>
  cached(`autoresponder:${guildId}`, () => getAutoResponderConfig(guildId));

export const moderationConfig = (guildId: string): Promise<ModerationConfig> =>
  cached(`moderation:${guildId}`, () => getModerationConfig(guildId));

/** Drop a guild's cached entries (e.g. after an in-bot config command). */
export function invalidate(guildId: string): void {
  for (const key of cache.keys()) {
    if (key.endsWith(`:${guildId}`)) cache.delete(key);
  }
}
