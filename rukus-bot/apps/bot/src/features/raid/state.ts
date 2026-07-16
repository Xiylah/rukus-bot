import { prisma } from "@rukus/db";
import { z } from "@rukus/shared";
import { log } from "../../lib/logger.js";

/**
 * Durable state for raid mode, stored in FeatureConfig under a runtime-only key.
 *
 * WHY FeatureConfig and not a new table: the same reasoning as the lockdown
 * state in features/roles/state.ts. Adding a Prisma model mid-flight risks a
 * conflict in a file this agent does not own, and FeatureConfig is already a
 * per-guild JSON blob keyed by a free-form `feature` string.
 *
 * This key is deliberately NOT in FEATURE_SCHEMAS: it is runtime state (is a
 * raid active, when does it auto-lift, what did it lock), not settings, so the
 * dashboard must never render it as a config page.
 */

const RAID_STATE_KEY = "state:raid";

export const raidStateSchema = z.object({
  active: z.boolean().default(false),
  /** Epoch ms the current raid tripped. */
  startedAt: z.number().default(0),
  /** Epoch ms to auto-lift, or null for manual-only. */
  liftAt: z.number().nullable().default(null),
  /** Which action tripped, so the lift knows what to undo. */
  action: z
    .enum(["lockdown", "kick-new", "quarantine", "alert-only"])
    .default("alert-only"),
  /** Channels this raid locked, with the @everyone override to restore. */
  lockedChannels: z
    .array(
      z.object({
        channelId: z.string(),
        previous: z.enum(["allow", "deny", "neutral"]),
      }),
    )
    .default([]),
});
export type RaidState = z.infer<typeof raidStateSchema>;

const INACTIVE: RaidState = raidStateSchema.parse({});

export async function getRaidState(guildId: string): Promise<RaidState> {
  try {
    const row = await prisma.featureConfig.findUnique({
      where: { guildId_feature: { guildId, feature: RAID_STATE_KEY } },
    });
    const parsed = raidStateSchema.safeParse(row?.config ?? {});
    return parsed.success ? parsed.data : { ...INACTIVE };
  } catch (err) {
    log.warn(`Reading raid state failed for ${guildId}: ${String(err)}`);
    return { ...INACTIVE };
  }
}

export async function setRaidState(
  guildId: string,
  state: RaidState,
): Promise<void> {
  // FeatureConfig has a required relation to Guild, so the guild row must exist.
  await prisma.guild.upsert({
    where: { id: guildId },
    create: { id: guildId },
    update: {},
  });
  await prisma.featureConfig.upsert({
    where: { guildId_feature: { guildId, feature: RAID_STATE_KEY } },
    create: { guildId, feature: RAID_STATE_KEY, config: state },
    update: { config: state },
  });
}

export async function clearRaidState(guildId: string): Promise<void> {
  await setRaidState(guildId, { ...INACTIVE });
}
