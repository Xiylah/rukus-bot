import {
  FEATURE_SCHEMAS,
  type TicketConfig,
  type FormsConfig,
  type TranslationConfig,
  type AutoResponderConfig,
  type ModerationConfig,
  type AccessConfig,
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

async function writeConfig<T>(
  guildId: string,
  feature: FeatureName,
  config: unknown,
): Promise<T> {
  const schema = FEATURE_SCHEMAS[feature];
  const parsed = schema.parse(config);
  const supabase = getSupabase();

  // Ensure the parent Guild row exists (FK constraint) — upsert is idempotent.
  const guildUpsert = await supabase
    .from("Guild")
    .upsert({ id: guildId }, { onConflict: "id" });
  if (guildUpsert.error) {
    throw new Error(`Supabase guild upsert failed: ${guildUpsert.error.message}`);
  }

  // Upsert the feature config on the (guildId, feature) unique constraint.
  const { error } = await supabase.from(TABLE).upsert(
    { guildId, feature, config: parsed },
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

export const getAccessConfig = (guildId: string) =>
  readConfig<AccessConfig>(guildId, "access");
export const setAccessConfig = (guildId: string, config: unknown) =>
  writeConfig<AccessConfig>(guildId, "access", config);
