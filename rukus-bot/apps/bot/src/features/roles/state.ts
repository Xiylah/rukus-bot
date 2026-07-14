import { prisma } from "@rukus/db";
import { z } from "@rukus/shared";
import { log } from "../../lib/logger.js";

/**
 * Durable state for /temprole and /lockdown.
 *
 * WHY it lives in FeatureConfig rather than its own table: the foundation
 * agent owns packages/db/prisma/schema.prisma, and adding a model there while
 * other phases are mid-edit is how you get a merge conflict in a file nobody
 * can safely resolve. FeatureConfig is already a per-guild JSON blob keyed by a
 * free-form `feature` string, so two extra keys give us persistence for free.
 *
 * These keys are deliberately NOT in FEATURE_SCHEMAS: they are runtime state,
 * not settings, and the dashboard must never render them as a config page.
 */

const TEMPROLE_KEY = "state:temproles";
const LOCKDOWN_KEY = "state:lockdowns";

export const tempRoleSchema = z.object({
  userId: z.string(),
  roleId: z.string(),
  /** Epoch ms. */
  expiresAt: z.number(),
  moderatorId: z.string(),
});
export type TempRole = z.infer<typeof tempRoleSchema>;

export const lockedChannelSchema = z.object({
  channelId: z.string(),
  /**
   * What @everyone's SendMessages override was BEFORE we locked it: "allow",
   * "deny", or "neutral". Restoring blindly to "allow" would silently grant
   * posting rights in a channel that was never open in the first place.
   */
  previous: z.enum(["allow", "deny", "neutral"]),
  /** Epoch ms, or null for an indefinite lock that /unlockdown must clear. */
  expiresAt: z.number().nullable(),
});
export type LockedChannel = z.infer<typeof lockedChannelSchema>;


/** Read a state blob, defaulting to an empty entry list on absence or corruption. */
async function readEntries<T>(
  guildId: string,
  key: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  try {
    const row = await prisma.featureConfig.findUnique({
      where: { guildId_feature: { guildId, feature: key } },
    });
    const raw = (row?.config ?? {}) as { entries?: unknown };
    const parsed = z.array(schema).safeParse(raw.entries ?? []);
    return parsed.success ? parsed.data : [];
  } catch (err) {
    log.warn(`Reading ${key} failed: ${String(err)}`);
    return [];
  }
}

async function writeState(guildId: string, key: string, value: unknown): Promise<void> {
  // FeatureConfig has a required relation to Guild, so the guild row must exist.
  await prisma.guild.upsert({
    where: { id: guildId },
    create: { id: guildId },
    update: {},
  });
  await prisma.featureConfig.upsert({
    where: { guildId_feature: { guildId, feature: key } },
    create: { guildId, feature: key, config: value as object },
    update: { config: value as object },
  });
}

// ---------------- Temp roles ----------------

export async function listTempRoles(guildId: string): Promise<TempRole[]> {
  return readEntries(guildId, TEMPROLE_KEY, tempRoleSchema);
}

export async function addTempRole(guildId: string, entry: TempRole): Promise<void> {
  const entries = await listTempRoles(guildId);
  // One (user, role) pair can only have one expiry: re-running /temprole on the
  // same pair extends it rather than stacking two timers that fight each other.
  const next = entries.filter(
    (e) => !(e.userId === entry.userId && e.roleId === entry.roleId),
  );
  next.push(entry);
  await writeState(guildId, TEMPROLE_KEY, { entries: next });
}

export async function setTempRoles(guildId: string, entries: TempRole[]): Promise<void> {
  await writeState(guildId, TEMPROLE_KEY, { entries });
}

// ---------------- Lockdowns ----------------

export async function listLockedChannels(guildId: string): Promise<LockedChannel[]> {
  return readEntries(guildId, LOCKDOWN_KEY, lockedChannelSchema);
}

export async function setLockedChannels(
  guildId: string,
  entries: LockedChannel[],
): Promise<void> {
  await writeState(guildId, LOCKDOWN_KEY, { entries });
}
