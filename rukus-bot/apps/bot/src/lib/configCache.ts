import {
  getTicketConfig,
  getFormsConfig,
  getTranslationConfig,
  getAutoResponderConfig,
  getModerationConfig,
  getWelcomeConfig,
  getCustomCommandsConfig,
  getReactionRolesConfig,
  getLoggingConfig,
  getStarboardConfig,
  getAutoRolesConfig,
  getLevelingConfig,
  getSuggestionsConfig,
  getGiveawaysConfig,
  getRemindersConfig,
  getHighlightsConfig,
  getAfkConfig,
  getUtilityConfig,
} from "@rukus/db";
import {
  ticketConfigSchema,
  formsConfigSchema,
  translationConfigSchema,
  autoResponderConfigSchema,
  moderationConfigSchema,
  welcomeConfigSchema,
  customCommandsConfigSchema,
  reactionRolesConfigSchema,
  loggingConfigSchema,
  starboardConfigSchema,
  autoRolesConfigSchema,
  levelingConfigSchema,
  suggestionsConfigSchema,
  giveawaysConfigSchema,
  remindersConfigSchema,
  highlightsConfigSchema,
  afkConfigSchema,
  utilityConfigSchema,
  type TicketConfig,
  type FormsConfig,
  type TranslationConfig,
  type AutoResponderConfig,
  type ModerationConfig,
  type WelcomeConfig,
  type CustomCommandsConfig,
  type ReactionRolesConfig,
  type LoggingConfig,
  type StarboardConfig,
  type AutoRolesConfig,
  type LevelingConfig,
  type SuggestionsConfig,
  type GiveawaysConfig,
  type RemindersConfig,
  type HighlightsConfig,
  type AfkConfig,
  type UtilityConfig,
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

/**
 * Cap both maps. Keys are `feature:guildId`, so their size grows with the
 * number of guilds served (roughly 18 features x N guilds). Unbounded, that is
 * a slow memory leak on a public bot; a plain Map also never evicts, so the
 * `lastGood` fallback would pin one entry per feature per guild forever.
 *
 * Both maps are insertion-ordered, so deleting the oldest key is a cheap LRU
 * approximation: a guild that has gone quiet ages out, and an active one is
 * simply re-read from the database on its next miss.
 */
const MAX_ENTRIES = 5_000;

type Entry<T> = { value: T; expires: number };
const cache = new Map<string, Entry<unknown>>();
/** Last successful value per key: the fallback when a config read fails. */
const lastGood = new Map<string, unknown>();
let lastErrorLoggedAt = 0;

function put<T>(map: Map<string, T>, key: string, value: T): void {
  // Re-insert so the key moves to the end (most recently used).
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

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
    put(cache, key, { value, expires: now + TTL_MS });
    put(lastGood, key, value);
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
    put(cache, key, { value, expires: now + ERROR_BACKOFF_MS });
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

export const welcomeConfig = (guildId: string): Promise<WelcomeConfig> =>
  cached(`welcome:${guildId}`, () => getWelcomeConfig(guildId), () =>
    welcomeConfigSchema.parse({}),
  );

export const customCommandsConfig = (
  guildId: string,
): Promise<CustomCommandsConfig> =>
  cached(`customcommands:${guildId}`, () => getCustomCommandsConfig(guildId), () =>
    customCommandsConfigSchema.parse({}),
  );

export const reactionRolesConfig = (
  guildId: string,
): Promise<ReactionRolesConfig> =>
  cached(`reactionroles:${guildId}`, () => getReactionRolesConfig(guildId), () =>
    reactionRolesConfigSchema.parse({}),
  );

export const loggingConfig = (guildId: string): Promise<LoggingConfig> =>
  cached(`logging:${guildId}`, () => getLoggingConfig(guildId), () =>
    loggingConfigSchema.parse({}),
  );

export const starboardConfig = (guildId: string): Promise<StarboardConfig> =>
  cached(`starboard:${guildId}`, () => getStarboardConfig(guildId), () =>
    starboardConfigSchema.parse({}),
  );

export const autoRolesConfig = (guildId: string): Promise<AutoRolesConfig> =>
  cached(`autoroles:${guildId}`, () => getAutoRolesConfig(guildId), () =>
    autoRolesConfigSchema.parse({}),
  );

export const levelingConfig = (guildId: string): Promise<LevelingConfig> =>
  cached(`leveling:${guildId}`, () => getLevelingConfig(guildId), () =>
    levelingConfigSchema.parse({}),
  );

export const suggestionsConfig = (
  guildId: string,
): Promise<SuggestionsConfig> =>
  cached(`suggestions:${guildId}`, () => getSuggestionsConfig(guildId), () =>
    suggestionsConfigSchema.parse({}),
  );

export const giveawaysConfig = (guildId: string): Promise<GiveawaysConfig> =>
  cached(`giveaways:${guildId}`, () => getGiveawaysConfig(guildId), () =>
    giveawaysConfigSchema.parse({}),
  );

export const remindersConfig = (guildId: string): Promise<RemindersConfig> =>
  cached(`reminders:${guildId}`, () => getRemindersConfig(guildId), () =>
    remindersConfigSchema.parse({}),
  );

export const highlightsConfig = (guildId: string): Promise<HighlightsConfig> =>
  cached(`highlights:${guildId}`, () => getHighlightsConfig(guildId), () =>
    highlightsConfigSchema.parse({}),
  );

export const afkConfig = (guildId: string): Promise<AfkConfig> =>
  cached(`afk:${guildId}`, () => getAfkConfig(guildId), () =>
    afkConfigSchema.parse({}),
  );

export const utilityConfig = (guildId: string): Promise<UtilityConfig> =>
  cached(`utility:${guildId}`, () => getUtilityConfig(guildId), () =>
    utilityConfigSchema.parse({}),
  );

/** Drop a guild's cached entries (e.g. after an in-bot config command). */
export function invalidate(guildId: string): void {
  for (const key of cache.keys()) {
    if (key.endsWith(`:${guildId}`)) cache.delete(key);
  }
}
