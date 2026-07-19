import type { GuildSubscription, TranslationUsage } from "@prisma/client";
import { prisma } from "./index.js";

/**
 * Bot-side (Prisma) reads and writes for premium subscriptions and metered
 * usage. The entitlement RULES live in @rukus/shared/premium; this file only
 * moves rows. The dashboard mirrors these over PostgREST in
 * @rukus/supabase/premium.
 */

export function getSubscription(
  guildId: string,
): Promise<GuildSubscription | null> {
  return prisma.guildSubscription.findUnique({ where: { guildId } });
}

/** The fields a caller (Stripe webhook, manual grant) may write. */
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
 * Only keys the caller actually supplied are written. A webhook that knows the
 * new status but nothing about a manual comp must not blank `manualUntil` by
 * passing undefined, which is exactly what spreading the whole input would do.
 */
export async function upsertSubscription(
  guildId: string,
  input: SubscriptionInput,
): Promise<GuildSubscription> {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) update[key] = value;
  }

  return prisma.guildSubscription.upsert({
    where: { guildId },
    create: {
      guildId,
      purchasedByUserId: input.purchasedByUserId,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      status: input.status ?? "inactive",
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      manualUntil: input.manualUntil ?? null,
    },
    update,
  });
}

export function getUsage(
  guildId: string,
  periodStart: Date,
): Promise<TranslationUsage | null> {
  return prisma.translationUsage.findUnique({
    where: { guildId_periodStart: { guildId, periodStart } },
  });
}

/**
 * Add `characters` to this guild's usage for the month, returning the new total.
 *
 * The increment is done by the DATABASE, not by reading the row and writing
 * back a sum. Several messages in a busy guild are translated concurrently, and
 * a read-then-write would let two of them both read 900 and both write 1000,
 * silently losing one message's worth of billed characters. `increment` compiles
 * to `characters = characters + $1` and is safe under concurrency; the upsert
 * covers the first write of a new month.
 */
export async function addUsage(
  guildId: string,
  periodStart: Date,
  characters: number,
): Promise<number> {
  const row = await prisma.translationUsage.upsert({
    where: { guildId_periodStart: { guildId, periodStart } },
    create: { guildId, periodStart, characters },
    update: { characters: { increment: characters } },
  });
  return row.characters;
}
