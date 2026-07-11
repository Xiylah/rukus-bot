import {
  FEATURE_SCHEMAS,
  ticketConfigSchema,
  formsConfigSchema,
  translationConfigSchema,
  autoResponderConfigSchema,
  moderationConfigSchema,
  welcomeConfigSchema,
  type TicketConfig,
  type FormsConfig,
  type TranslationConfig,
  type AutoResponderConfig,
  type ModerationConfig,
  type WelcomeConfig,
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

export const getWelcomeConfig = (guildId: string) =>
  readConfig<WelcomeConfig>(guildId, "welcome");

export const setWelcomeConfig = (guildId: string, config: unknown) =>
  writeConfig<WelcomeConfig>(guildId, "welcome", config);

export {
  ticketConfigSchema,
  formsConfigSchema,
  translationConfigSchema,
  autoResponderConfigSchema,
  moderationConfigSchema,
  welcomeConfigSchema,
};
