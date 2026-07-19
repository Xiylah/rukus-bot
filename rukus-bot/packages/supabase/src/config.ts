import {
  FEATURE_SCHEMAS,
  type TicketConfig,
  type FormsConfig,
  type TranslationConfig,
  type AutoResponderConfig,
  type ModerationConfig,
  type VerificationConfig,
  type RaidConfig,
  type WelcomeConfig,
  type CustomCommandsConfig,
  type AccessConfig,
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
  type SocialAlertsConfig,
  type BirthdaysConfig,
  type InviteTrackerConfig,
  type TempVoiceConfig,
  type ContestsConfig,
} from "@rukus/shared";
import { getSupabase } from "./index.js";

/**
 * Dashboard-side config read/write, mirroring @rukus/db's config.ts but over
 * PostgREST. Same Zod schemas → identical validation and defaulting, so the
 * bot (Prisma) and dashboard (Supabase) always agree on config shape.
 *
 * Prisma created the table as "FeatureConfig" with quoted camelCase columns
 * (guildId, feature, config), so we reference those exact names here.
 */

type FeatureName = keyof typeof FEATURE_SCHEMAS;

const TABLE = "FeatureConfig";

async function readConfig<T>(guildId: string, feature: FeatureName): Promise<T> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select("config")
    .eq("guildId", guildId)
    .eq("feature", feature)
    .maybeSingle();

  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  const schema = FEATURE_SCHEMAS[feature];
  // Empty object fills in all defaults when there's no row yet.
  return schema.parse(data?.config ?? {}) as T;
}

/**
 * Prisma applies `@default(cuid())` and `@updatedAt` in its CLIENT, not as
 * database defaults. This layer writes through PostgREST instead, so it has to
 * supply those columns itself - otherwise Postgres rejects the insert with
 * `null value in column "updatedAt" violates not-null constraint`.
 * (A migration also adds DB-level defaults; this keeps us correct either way.)
 */
function newId(): string {
  // Not a real cuid, but the column only needs a unique string id.
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function writeConfig<T>(
  guildId: string,
  feature: FeatureName,
  config: unknown,
): Promise<T> {
  const schema = FEATURE_SCHEMAS[feature];
  const parsed = schema.parse(config);
  const supabase = getSupabase();
  const now = new Date().toISOString();

  // Ensure the parent Guild row exists (FK constraint) - upsert is idempotent.
  const guildUpsert = await supabase
    .from("Guild")
    .upsert({ id: guildId, updatedAt: now }, { onConflict: "id" });
  if (guildUpsert.error) {
    throw new Error(`Supabase guild upsert failed: ${guildUpsert.error.message}`);
  }

  // Upsert the feature config on the (guildId, feature) unique constraint.
  // `id` is only used on insert; on conflict the existing row keeps its id.
  const { error } = await supabase.from(TABLE).upsert(
    { id: newId(), guildId, feature, config: parsed, updatedAt: now },
    { onConflict: "guildId,feature" },
  );
  if (error) throw new Error(`Supabase write failed: ${error.message}`);
  return parsed as T;
}

export const getTicketConfig = (guildId: string) =>
  readConfig<TicketConfig>(guildId, "tickets");
export const setTicketConfig = (guildId: string, config: unknown) =>
  writeConfig<TicketConfig>(guildId, "tickets", config);

export const getFormsConfig = (guildId: string) =>
  readConfig<FormsConfig>(guildId, "forms");
export const setFormsConfig = (guildId: string, config: unknown) =>
  writeConfig<FormsConfig>(guildId, "forms", config);

export const getTranslationConfig = (guildId: string) =>
  readConfig<TranslationConfig>(guildId, "translation");
export const setTranslationConfig = (guildId: string, config: unknown) =>
  writeConfig<TranslationConfig>(guildId, "translation", config);

export const getAutoResponderConfig = (guildId: string) =>
  readConfig<AutoResponderConfig>(guildId, "autoresponder");
export const setAutoResponderConfig = (guildId: string, config: unknown) =>
  writeConfig<AutoResponderConfig>(guildId, "autoresponder", config);

export const getModerationConfig = (guildId: string) =>
  readConfig<ModerationConfig>(guildId, "moderation");
export const setModerationConfig = (guildId: string, config: unknown) =>
  writeConfig<ModerationConfig>(guildId, "moderation", config);

export const getVerificationConfig = (guildId: string) =>
  readConfig<VerificationConfig>(guildId, "verification");
export const setVerificationConfig = (guildId: string, config: unknown) =>
  writeConfig<VerificationConfig>(guildId, "verification", config);

export const getRaidConfig = (guildId: string) =>
  readConfig<RaidConfig>(guildId, "raid");
export const setRaidConfig = (guildId: string, config: unknown) =>
  writeConfig<RaidConfig>(guildId, "raid", config);

export const getWelcomeConfig = (guildId: string) =>
  readConfig<WelcomeConfig>(guildId, "welcome");
export const setWelcomeConfig = (guildId: string, config: unknown) =>
  writeConfig<WelcomeConfig>(guildId, "welcome", config);

export const getCustomCommandsConfig = (guildId: string) =>
  readConfig<CustomCommandsConfig>(guildId, "customcommands");
export const setCustomCommandsConfig = (guildId: string, config: unknown) =>
  writeConfig<CustomCommandsConfig>(guildId, "customcommands", config);

export const getAccessConfig = (guildId: string) =>
  readConfig<AccessConfig>(guildId, "access");
export const setAccessConfig = (guildId: string, config: unknown) =>
  writeConfig<AccessConfig>(guildId, "access", config);

export const getReactionRolesConfig = (guildId: string) =>
  readConfig<ReactionRolesConfig>(guildId, "reactionroles");
export const setReactionRolesConfig = (guildId: string, config: unknown) =>
  writeConfig<ReactionRolesConfig>(guildId, "reactionroles", config);

export const getLoggingConfig = (guildId: string) =>
  readConfig<LoggingConfig>(guildId, "logging");
export const setLoggingConfig = (guildId: string, config: unknown) =>
  writeConfig<LoggingConfig>(guildId, "logging", config);

export const getStarboardConfig = (guildId: string) =>
  readConfig<StarboardConfig>(guildId, "starboard");
export const setStarboardConfig = (guildId: string, config: unknown) =>
  writeConfig<StarboardConfig>(guildId, "starboard", config);

export const getAutoRolesConfig = (guildId: string) =>
  readConfig<AutoRolesConfig>(guildId, "autoroles");
export const setAutoRolesConfig = (guildId: string, config: unknown) =>
  writeConfig<AutoRolesConfig>(guildId, "autoroles", config);

export const getLevelingConfig = (guildId: string) =>
  readConfig<LevelingConfig>(guildId, "leveling");
export const setLevelingConfig = (guildId: string, config: unknown) =>
  writeConfig<LevelingConfig>(guildId, "leveling", config);

export const getSuggestionsConfig = (guildId: string) =>
  readConfig<SuggestionsConfig>(guildId, "suggestions");
export const setSuggestionsConfig = (guildId: string, config: unknown) =>
  writeConfig<SuggestionsConfig>(guildId, "suggestions", config);

export const getGiveawaysConfig = (guildId: string) =>
  readConfig<GiveawaysConfig>(guildId, "giveaways");
export const setGiveawaysConfig = (guildId: string, config: unknown) =>
  writeConfig<GiveawaysConfig>(guildId, "giveaways", config);

export const getRemindersConfig = (guildId: string) =>
  readConfig<RemindersConfig>(guildId, "reminders");
export const setRemindersConfig = (guildId: string, config: unknown) =>
  writeConfig<RemindersConfig>(guildId, "reminders", config);

export const getHighlightsConfig = (guildId: string) =>
  readConfig<HighlightsConfig>(guildId, "highlights");
export const setHighlightsConfig = (guildId: string, config: unknown) =>
  writeConfig<HighlightsConfig>(guildId, "highlights", config);

export const getAfkConfig = (guildId: string) =>
  readConfig<AfkConfig>(guildId, "afk");
export const setAfkConfig = (guildId: string, config: unknown) =>
  writeConfig<AfkConfig>(guildId, "afk", config);

export const getUtilityConfig = (guildId: string) =>
  readConfig<UtilityConfig>(guildId, "utility");
export const setUtilityConfig = (guildId: string, config: unknown) =>
  writeConfig<UtilityConfig>(guildId, "utility", config);

export const getSocialAlertsConfig = (guildId: string) =>
  readConfig<SocialAlertsConfig>(guildId, "socialalerts");
export const setSocialAlertsConfig = (guildId: string, config: unknown) =>
  writeConfig<SocialAlertsConfig>(guildId, "socialalerts", config);

export const getBirthdaysConfig = (guildId: string) =>
  readConfig<BirthdaysConfig>(guildId, "birthdays");
export const setBirthdaysConfig = (guildId: string, config: unknown) =>
  writeConfig<BirthdaysConfig>(guildId, "birthdays", config);

export const getInviteTrackerConfig = (guildId: string) =>
  readConfig<InviteTrackerConfig>(guildId, "invitetracker");
export const setInviteTrackerConfig = (guildId: string, config: unknown) =>
  writeConfig<InviteTrackerConfig>(guildId, "invitetracker", config);

export const getTempVoiceConfig = (guildId: string) =>
  readConfig<TempVoiceConfig>(guildId, "tempvoice");
export const setTempVoiceConfig = (guildId: string, config: unknown) =>
  writeConfig<TempVoiceConfig>(guildId, "tempvoice", config);

export const getContestsConfig = (guildId: string) =>
  readConfig<ContestsConfig>(guildId, "contests");
export const setContestsConfig = (guildId: string, config: unknown) =>
  writeConfig<ContestsConfig>(guildId, "contests", config);
