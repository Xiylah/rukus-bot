"use server";

import { revalidatePath } from "next/cache";
import { FEATURE_SCHEMAS } from "@rukus/shared";
import {
  getTicketConfig,
  setTicketConfig,
  getFormsConfig,
  setFormsConfig,
  getAutoResponderConfig,
  setAutoResponderConfig,
  getWelcomeConfig,
  setWelcomeConfig,
  getCustomCommandsConfig,
  setCustomCommandsConfig,
  getReactionRolesConfig,
  setReactionRolesConfig,
  getLoggingConfig,
  setLoggingConfig,
  getStarboardConfig,
  setStarboardConfig,
  getAutoRolesConfig,
  setAutoRolesConfig,
  getLevelingConfig,
  setLevelingConfig,
  getSuggestionsConfig,
  setSuggestionsConfig,
  getGiveawaysConfig,
  setGiveawaysConfig,
  getRemindersConfig,
  setRemindersConfig,
  getHighlightsConfig,
  setHighlightsConfig,
  getUtilityConfig,
  setUtilityConfig,
  getSocialAlertsConfig,
  setSocialAlertsConfig,
  getBirthdaysConfig,
  setBirthdaysConfig,
  getInviteTrackerConfig,
  setInviteTrackerConfig,
  getTempVoiceConfig,
  setTempVoiceConfig,
} from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";

/**
 * Flip a module on or off straight from the overview grid, without making staff
 * open the module's page just to hit one switch.
 *
 * Only features whose schema carries a top-level `enabled` flag are listed here.
 * Translation and moderation are deliberately absent: they have no single on/off
 * key (they are gated by their individual filters), so there is nothing honest
 * for a one-click toggle to flip.
 */

type ToggleableFeature = keyof typeof ACCESSORS;

interface Accessor {
  read: (guildId: string) => Promise<unknown>;
  write: (guildId: string, config: unknown) => Promise<unknown>;
  /** Page path segment, so we can revalidate the module's own page too. */
  slug: string;
}

const ACCESSORS = {
  tickets: { read: getTicketConfig, write: setTicketConfig, slug: "tickets" },
  forms: { read: getFormsConfig, write: setFormsConfig, slug: "forms" },
  autoresponder: {
    read: getAutoResponderConfig,
    write: setAutoResponderConfig,
    slug: "autoresponder",
  },
  welcome: { read: getWelcomeConfig, write: setWelcomeConfig, slug: "welcome" },
  customcommands: {
    read: getCustomCommandsConfig,
    write: setCustomCommandsConfig,
    slug: "commands",
  },
  reactionroles: {
    read: getReactionRolesConfig,
    write: setReactionRolesConfig,
    slug: "reactionroles",
  },
  logging: { read: getLoggingConfig, write: setLoggingConfig, slug: "logging" },
  starboard: { read: getStarboardConfig, write: setStarboardConfig, slug: "starboard" },
  autoroles: { read: getAutoRolesConfig, write: setAutoRolesConfig, slug: "autoroles" },
  leveling: { read: getLevelingConfig, write: setLevelingConfig, slug: "leveling" },
  suggestions: {
    read: getSuggestionsConfig,
    write: setSuggestionsConfig,
    slug: "suggestions",
  },
  giveaways: { read: getGiveawaysConfig, write: setGiveawaysConfig, slug: "giveaways" },
  reminders: { read: getRemindersConfig, write: setRemindersConfig, slug: "reminders" },
  highlights: {
    read: getHighlightsConfig,
    write: setHighlightsConfig,
    slug: "highlights",
  },
  utility: { read: getUtilityConfig, write: setUtilityConfig, slug: "utility" },
  socialalerts: {
    read: getSocialAlertsConfig,
    write: setSocialAlertsConfig,
    slug: "social",
  },
  birthdays: { read: getBirthdaysConfig, write: setBirthdaysConfig, slug: "birthdays" },
  invitetracker: {
    read: getInviteTrackerConfig,
    write: setInviteTrackerConfig,
    slug: "invites",
  },
  tempvoice: { read: getTempVoiceConfig, write: setTempVoiceConfig, slug: "tempvoice" },
} satisfies Record<string, Accessor>;

export type ToggleResult = { ok: true; enabled: boolean } | { ok: false; error: string };

export async function toggleModule(
  guildId: string,
  feature: string,
  enabled: boolean,
): Promise<ToggleResult> {
  // The security boundary. A server action is a callable endpoint, so the
  // guildId arriving from the browser is never trusted on its own.
  await requireGuildAccess(guildId);

  if (!Object.prototype.hasOwnProperty.call(ACCESSORS, feature)) {
    return { ok: false, error: "That module cannot be toggled from here." };
  }
  const key = feature as ToggleableFeature;
  const accessor: Accessor = ACCESSORS[key];

  const current = await accessor.read(guildId);

  // Re-validate through the SAME Zod schema the bot reads with, so a config row
  // that predates a schema change is healed rather than written back malformed.
  const parsed = FEATURE_SCHEMAS[key].safeParse({
    ...(current as Record<string, unknown>),
    enabled,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid config" };
  }

  await accessor.write(guildId, parsed.data);

  revalidatePath(`/dashboard/${guildId}`);
  revalidatePath(`/dashboard/${guildId}/${accessor.slug}`);
  return { ok: true, enabled };
}
