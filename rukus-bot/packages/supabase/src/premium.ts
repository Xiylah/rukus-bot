import { getSupabase } from "./index.js";

/**
 * Dashboard-side (PostgREST) reads and writes for premium.
 *
 * Mirrors @rukus/db's premium.ts so the dashboard and the Stripe webhook, which
 * run on the edge where Prisma's raw Postgres connection does not work, hit the
 * same rows the bot does. The entitlement rules themselves live in
 * @rukus/shared/premium: this file only moves rows.
 *
 * Prisma created these tables with quoted camelCase columns, so we reference
 * those exact names, and applies `@default(cuid())`/`@updatedAt` in its CLIENT
 * rather than as database defaults, so writes here supply them explicitly.
 */

export interface SubscriptionRow {
  guildId: string;
  purchasedByUserId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  manualUntil: Date | null;
}

export interface UsageRow {
  guildId: string;
  periodStart: Date;
  characters: number;
}

const SUB_TABLE = "GuildSubscription";
const USAGE_TABLE = "TranslationUsage";

/** See the same note in config.ts: the column only needs a unique string id. */
function newId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

export async function getSubscription(
  guildId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await getSupabase()
    .from(SUB_TABLE)
    .select(
      "guildId, purchasedByUserId, stripeCustomerId, stripeSubscriptionId, status, currentPeriodEnd, cancelAtPeriodEnd, manualUntil",
    )
    .eq("guildId", guildId)
    .maybeSingle();

  // A read failure must not be reported as "no subscription": that would render
  // a paying customer's billing page as unsubscribed and invite them to buy a
  // second one. Entitlement is decided by a successful read or not at all.
  if (error) throw new Error(`Supabase subscription read failed: ${error.message}`);
  if (!data) return null;

  return {
    guildId: data.guildId,
    purchasedByUserId: data.purchasedByUserId,
    stripeCustomerId: data.stripeCustomerId ?? null,
    stripeSubscriptionId: data.stripeSubscriptionId ?? null,
    status: data.status ?? "inactive",
    currentPeriodEnd: toDate(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
    manualUntil: toDate(data.manualUntil),
  };
}

export interface SubscriptionInput {
  purchasedByUserId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: string;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  manualUntil?: Date | null;
}

/**
 * Create or update a guild's subscription row.
 *
 * Undefined keys are dropped rather than written as null: a webhook that knows
 * only the new Stripe status must not blank a manually granted comp just
 * because it had nothing to say about it.
 */
export async function upsertSubscription(
  guildId: string,
  input: SubscriptionInput,
): Promise<void> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id: newId(),
    guildId,
    updatedAt: now,
    purchasedByUserId: input.purchasedByUserId,
  };
  if (input.stripeCustomerId !== undefined) row.stripeCustomerId = input.stripeCustomerId;
  if (input.stripeSubscriptionId !== undefined) {
    row.stripeSubscriptionId = input.stripeSubscriptionId;
  }
  if (input.status !== undefined) row.status = input.status;
  if (input.currentPeriodEnd !== undefined) {
    row.currentPeriodEnd = input.currentPeriodEnd?.toISOString() ?? null;
  }
  if (input.cancelAtPeriodEnd !== undefined) {
    row.cancelAtPeriodEnd = input.cancelAtPeriodEnd;
  }
  if (input.manualUntil !== undefined) {
    row.manualUntil = input.manualUntil?.toISOString() ?? null;
  }

  const { error } = await getSupabase()
    .from(SUB_TABLE)
    .upsert(row, { onConflict: "guildId" });
  if (error) throw new Error(`Supabase subscription write failed: ${error.message}`);
}

export async function getUsage(
  guildId: string,
  periodStart: Date,
): Promise<UsageRow | null> {
  const { data, error } = await getSupabase()
    .from(USAGE_TABLE)
    .select("guildId, periodStart, characters")
    .eq("guildId", guildId)
    .eq("periodStart", periodStart.toISOString())
    .maybeSingle();

  if (error) throw new Error(`Supabase usage read failed: ${error.message}`);
  if (!data) return null;

  return {
    guildId: data.guildId,
    periodStart: new Date(data.periodStart),
    characters: data.characters ?? 0,
  };
}

/**
 * Add `characters` to this guild's monthly usage, returning the new total.
 *
 * This calls a Postgres function rather than reading the row and writing back a
 * sum. PostgREST cannot express `characters = characters + $1`, and a
 * read-then-write from concurrent requests loses increments: two callers both
 * read 900 and both write 1000, and the metered characters in between are never
 * billed. The function does the add inside a single statement, so the database
 * serialises it.
 *
 * Requires this migration (the lead runs it):
 *
 *   create or replace function rukus.add_translation_usage(
 *     p_guild_id text, p_period_start timestamptz, p_characters int
 *   ) returns int language sql as $$
 *     insert into rukus."TranslationUsage" (id, "guildId", "periodStart", characters, "updatedAt")
 *     values (gen_random_uuid()::text, p_guild_id, p_period_start, p_characters, now())
 *     on conflict ("guildId", "periodStart") do update
 *       set characters = rukus."TranslationUsage".characters + excluded.characters,
 *           "updatedAt" = now()
 *     returning characters;
 *   $$;
 */
export async function addUsage(
  guildId: string,
  periodStart: Date,
  characters: number,
): Promise<number> {
  const { data, error } = await getSupabase().rpc("add_translation_usage", {
    p_guild_id: guildId,
    p_period_start: periodStart.toISOString(),
    p_characters: characters,
  });

  if (error) throw new Error(`Supabase usage increment failed: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
