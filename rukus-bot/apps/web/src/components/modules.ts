import type { FEATURE_SCHEMAS } from "@rukus/shared";

/**
 * The single source of truth for "what modules exist" in the dashboard.
 *
 * The overview grid and the sidebar both read this, so a module can never show
 * up in one place and be missing from the other. Adding a module here is the
 * only edit needed to get it a nav entry AND an overview card.
 */

export type FeatureKey = keyof typeof FEATURE_SCHEMAS;

export type ModuleCategory =
  | "Support"
  | "Engagement"
  | "Moderation"
  | "Community"
  | "Utility";

export const MODULE_CATEGORIES: ModuleCategory[] = [
  "Support",
  "Engagement",
  "Moderation",
  "Community",
  "Utility",
];

export interface ModuleDef {
  /** URL segment under /dashboard/[guildId]/. */
  slug: string;
  /** FEATURE_SCHEMAS key, or null for pages that are not a config feature. */
  feature: FeatureKey | null;
  icon: string;
  name: string;
  description: string;
  category: ModuleCategory;
  /**
   * False when the feature's schema has no top-level `enabled` flag, so there
   * is nothing a one-click toggle could flip. Those cards show status and a
   * Configure link instead of a switch.
   *
   * Cases is the only one left: it has no config of its own, it is a view over
   * the records moderation writes. Its switch (casesEnabled) therefore lives on
   * the Moderation page, next to the thing that produces the records.
   */
  toggleable: boolean;
}

export const MODULES: ModuleDef[] = [
  // ---- Support ----
  {
    slug: "tickets",
    feature: "tickets",
    icon: "🎫",
    name: "Tickets",
    description: "Private support channels members open from a panel.",
    category: "Support",
    toggleable: true,
  },
  {
    slug: "forms",
    feature: "forms",
    icon: "📝",
    name: "Forms",
    description: "Applications members fill in, reviewed by your staff.",
    category: "Support",
    toggleable: true,
  },

  // ---- Engagement ----
  {
    slug: "leveling",
    feature: "leveling",
    icon: "📈",
    name: "Leveling",
    description: "XP, ranks and rewards for members who stay active.",
    category: "Engagement",
    toggleable: true,
  },
  {
    slug: "starboard",
    feature: "starboard",
    icon: "⭐",
    name: "Starboard",
    description: "Pin the messages your server reacts to the most.",
    category: "Engagement",
    toggleable: true,
  },
  {
    slug: "suggestions",
    feature: "suggestions",
    icon: "💡",
    name: "Suggestions",
    description: "Collect ideas and let members vote on them.",
    category: "Engagement",
    toggleable: true,
  },
  {
    slug: "giveaways",
    feature: "giveaways",
    icon: "🎉",
    name: "Giveaways",
    description: "Run timed prize draws with automatic winners.",
    category: "Engagement",
    toggleable: true,
  },
  {
    slug: "birthdays",
    feature: "birthdays",
    icon: "🎂",
    name: "Birthdays",
    description: "Wish members a happy birthday, automatically.",
    category: "Engagement",
    toggleable: true,
  },

  // ---- Moderation ----
  {
    slug: "moderation",
    feature: "moderation",
    icon: "🛡️",
    name: "Moderation",
    description: "Filters, anti-spam and the tools your mods reach for.",
    category: "Moderation",
    toggleable: true,
  },
  {
    slug: "logging",
    feature: "logging",
    icon: "📜",
    name: "Logging",
    description: "An audit trail of everything that happens in the server.",
    category: "Moderation",
    toggleable: true,
  },
  {
    slug: "cases",
    feature: null,
    icon: "📋",
    name: "Cases",
    description: "Every warning, mute and ban, searchable in one place.",
    category: "Moderation",
    toggleable: false,
  },
  {
    slug: "autoresponder",
    feature: "autoresponder",
    icon: "💬",
    name: "Auto-responder",
    description: "Reply to common phrases without a mod lifting a finger.",
    category: "Moderation",
    toggleable: true,
  },

  // ---- Community ----
  {
    slug: "welcome",
    feature: "welcome",
    icon: "👋",
    name: "Welcome",
    description: "Greet new members and show them where to start.",
    category: "Community",
    toggleable: true,
  },
  {
    slug: "autoroles",
    feature: "autoroles",
    icon: "🏷️",
    name: "Auto-roles",
    description: "Hand out roles on join, or after a member sticks around.",
    category: "Community",
    toggleable: true,
  },
  {
    slug: "reactionroles",
    feature: "reactionroles",
    icon: "🎭",
    name: "Reaction roles",
    description: "Let members pick their own roles from a panel.",
    category: "Community",
    toggleable: true,
  },
  {
    slug: "invites",
    feature: "invitetracker",
    icon: "📨",
    name: "Invites",
    description: "See who is actually bringing people to the server.",
    category: "Community",
    toggleable: true,
  },
  {
    slug: "tempvoice",
    feature: "tempvoice",
    icon: "🔊",
    name: "Temp voice",
    description: "Members create their own voice channels on demand.",
    category: "Community",
    toggleable: true,
  },

  // ---- Utility ----
  {
    slug: "translation",
    feature: "translation",
    icon: "🌐",
    name: "Translation",
    description: "Translate what your international members are saying.",
    category: "Utility",
    toggleable: true,
  },
  {
    slug: "commands",
    feature: "customcommands",
    icon: "⌨️",
    name: "Custom commands",
    description: "Your own commands, answering your own questions.",
    category: "Utility",
    toggleable: true,
  },
  {
    slug: "social",
    feature: "socialalerts",
    icon: "📡",
    name: "Social alerts",
    description: "Announce new YouTube, Twitch and RSS posts.",
    category: "Utility",
    toggleable: true,
  },
  {
    slug: "reminders",
    feature: "reminders",
    icon: "⏰",
    name: "Reminders",
    description: "Members ask the bot to nudge them later.",
    category: "Utility",
    toggleable: true,
  },
  {
    slug: "highlights",
    feature: "highlights",
    icon: "🔔",
    name: "Highlights",
    description: "Ping members when a word they care about is said.",
    category: "Utility",
    toggleable: true,
  },
  {
    slug: "utility",
    feature: "utility",
    icon: "🔧",
    name: "Utility",
    description: "Polls, the embed builder and the small everyday tools.",
    category: "Utility",
    toggleable: true,
  },
];
