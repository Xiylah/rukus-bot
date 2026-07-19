import {
  FEATURE_SCHEMAS,
  ticketConfigSchema,
  formsConfigSchema,
  translationConfigSchema,
  autoResponderConfigSchema,
  moderationConfigSchema,
  verificationConfigSchema,
  raidConfigSchema,
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
  socialAlertsConfigSchema,
  birthdaysConfigSchema,
  inviteTrackerConfigSchema,
  tempVoiceConfigSchema,
  contestsConfigSchema,
  economyConfigSchema,
  shopConfigSchema,
  type TicketConfig,
  type FormsConfig,
  type TranslationConfig,
  type AutoResponderConfig,
  type ModerationConfig,
  type VerificationConfig,
  type RaidConfig,
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
  type SocialAlertsConfig,
  type BirthdaysConfig,
  type InviteTrackerConfig,
  type TempVoiceConfig,
  type ContestsConfig,
  type EconomyConfig,
  type ShopConfig,
} from "@rukus/shared";
import { prisma } from "./index.js";

/**
 * Read/write helpers for per-guild feature config.
 *
 * Reads always return a fully-defaulted, schema-valid object even when no row
 * exists yet - so callers never have to null-check individual fields. Writes
 * validate against the same schema, so a bad dashboard payload is rejected
 * before it ever reaches the bot.
 */

type FeatureName = keyof typeof FEATURE_SCHEMAS;

async function readConfig<T>(
  guildId: string,
  feature: FeatureName,
): Promise<T> {
  const row = await prisma.featureConfig.findUnique({
    where: { guildId_feature: { guildId, feature } },
  });
  const schema = FEATURE_SCHEMAS[feature];
  // parse() with an empty object fills in all defaults when there's no row.
  return schema.parse(row?.config ?? {}) as T;
}

async function writeConfig<T>(
  guildId: string,
  feature: FeatureName,
  config: unknown,
): Promise<T> {
  const schema = FEATURE_SCHEMAS[feature];
  const parsed = schema.parse(config);
  // Ensure the guild row exists first (FK constraint).
  await prisma.guild.upsert({
    where: { id: guildId },
    create: { id: guildId },
    update: {},
  });
  await prisma.featureConfig.upsert({
    where: { guildId_feature: { guildId, feature } },
    create: { guildId, feature, config: parsed as object },
    update: { config: parsed as object },
  });
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

export const getEconomyConfig = (guildId: string) =>
  readConfig<EconomyConfig>(guildId, "economy");

export const setEconomyConfig = (guildId: string, config: unknown) =>
  writeConfig<EconomyConfig>(guildId, "economy", config);

export const getShopConfig = (guildId: string) =>
  readConfig<ShopConfig>(guildId, "shop");

export const setShopConfig = (guildId: string, config: unknown) =>
  writeConfig<ShopConfig>(guildId, "shop", config);

export {
  ticketConfigSchema,
  formsConfigSchema,
  translationConfigSchema,
  autoResponderConfigSchema,
  moderationConfigSchema,
  verificationConfigSchema,
  raidConfigSchema,
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
  socialAlertsConfigSchema,
  birthdaysConfigSchema,
  inviteTrackerConfigSchema,
  tempVoiceConfigSchema,
  contestsConfigSchema,
  economyConfigSchema,
  shopConfigSchema,
};
