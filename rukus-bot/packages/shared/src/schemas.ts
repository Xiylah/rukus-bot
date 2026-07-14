import { z } from "zod";

/**
 * Zod schemas for feature configuration blobs.
 *
 * Config is stored as JSON in Postgres (one row per guild per feature). These
 * schemas are the single source of truth for that JSON's shape: the dashboard
 * validates form input against them before writing, and the bot validates on
 * read so a malformed row can never crash an interaction handler.
 */

/** A Discord snowflake as a string (channel/role/user id). */
const snowflake = z
  .string()
  .regex(/^\d{17,20}$/, "Must be a Discord ID")
  .optional();

// ---------------- Tickets ----------------

/**
 * One kind of ticket (Support, Mute Appeal, ...). With multiple types the
 * panel renders a Ticket-Tool-style dropdown; each type controls how its
 * ticket channel is named so staff can tell tickets apart at a glance.
 * Unset per-type fields fall back to the guild-level ticket config.
 */
export const ticketTypeSchema = z.object({
  id: z.string().min(1),
  /** Shown in the dropdown and in the ticket embed, e.g. "Mute Appeal". */
  label: z.string().min(1).max(80),
  /** Dropdown option description (Discord caps these at 100 chars). */
  description: z.string().max(100).default(""),
  /** Unicode emoji shown next to the option, e.g. "🔨". */
  emoji: z.string().max(8).default("🎫"),
  /**
   * Channel name template. {count} → per-guild ticket number (0001),
   * {type} → the label. E.g. "mute-appeal-{count}".
   */
  nameTemplate: z.string().min(1).max(90).default("ticket-{count}"),
  /** Optional category override; falls back to the global categoryId. */
  categoryId: snowflake,
  /** Optional welcome override; falls back to the global welcomeMessage. */
  welcomeMessage: z.string().max(2000).optional(),
  /**
   * Optional form to fill BEFORE the ticket opens (id of a form in the forms
   * config). Answers are posted into the ticket channel for staff.
   */
  formId: z.string().optional(),
  /** Optional transcript channel override; falls back to the global one. */
  transcriptChannelId: snowflake,
  /**
   * Optional support-role override. When set, ONLY these roles can see and
   * handle this type's tickets (e.g. mute appeals visible to admins only).
   * Empty = use the global supportRoleIds.
   */
  supportRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
});

export type TicketType = z.infer<typeof ticketTypeSchema>;

export const ticketConfigSchema = z.object({
  /** Whether the ticket feature is active for this guild. */
  enabled: z.boolean().default(false),
  /** Category under which new ticket channels are created. */
  categoryId: snowflake,
  /** Channel where closed-ticket transcripts are posted. */
  transcriptChannelId: snowflake,
  /** Roles that can see/claim/close tickets (staff). */
  supportRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Message shown at the top of a freshly opened ticket. */
  welcomeMessage: z
    .string()
    .max(2000)
    .default("Thanks for opening a ticket! Staff will be with you shortly."),
  /** Max simultaneously-open tickets per user (0 = unlimited). */
  maxOpenPerUser: z.number().int().min(0).max(50).default(1),
  /** Where the live panel message lives, so the dashboard can update it
   *  in place instead of posting duplicates. Set by the publish action. */
  panelChannelId: snowflake,
  panelMessageId: snowflake,
  /** Ping the support roles when a ticket opens, so staff notice fast. */
  pingSupportOnOpen: z.boolean().default(false),
  /** Auto-close tickets after a period with no messages. */
  autoCloseEnabled: z.boolean().default(false),
  /** Hours of inactivity before auto-close (a warning fires ~12h earlier). */
  autoCloseHours: z.number().int().min(2).max(720).default(48),
  /**
   * Ticket types. Empty = classic single-button panel using the settings
   * above. 2+ = the panel becomes a dropdown (Discord caps options at 25).
   */
  types: z.array(ticketTypeSchema).max(25).default([]),
  /** The panel embed users click to open a ticket. */
  panel: z
    .object({
      title: z.string().max(256).default("Need help?"),
      description: z
        .string()
        .max(4000)
        .default("Click the button below to open a support ticket."),
      /** Button text (single type) or dropdown placeholder (multiple types). */
      buttonLabel: z.string().max(80).default("Open a ticket"),
      /** Embed accent color, hex like #5865f2. */
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default("#5865f2"),
    })
    .default({}),
});

export type TicketConfig = z.infer<typeof ticketConfigSchema>;

// ---------------- Forms ----------------

/** A single question in a form. Discord modals allow max 5 of these. */
export const formFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(45), // Discord modal label limit
  style: z.enum(["short", "paragraph"]).default("short"),
  required: z.boolean().default(true),
  placeholder: z.string().max(100).optional(),
  minLength: z.number().int().min(0).max(4000).optional(),
  maxLength: z.number().int().min(1).max(4000).optional(),
});

export type FormField = z.infer<typeof formFieldSchema>;

export const formSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  title: z.string().min(1).max(45), // becomes the modal title
  description: z.string().max(4000).default(""),
  buttonLabel: z.string().max(80).default("Apply"),
  /**
   * Whether this form gets a button on the /form panel. Turn OFF for forms
   * that only exist as pre-ticket questionnaires attached to ticket types.
   */
  showOnPanel: z.boolean().default(true),
  /** Channel where completed submissions are posted for review. */
  reviewChannelId: snowflake,
  /** Role granted automatically on approval (e.g. an "Applicant" role). */
  approveRoleId: snowflake,
  fields: z.array(formFieldSchema).min(1).max(5),
});

export type Form = z.infer<typeof formSchema>;

export const formsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  forms: z.array(formSchema).default([]),
  /** Where the live panel message lives, so the dashboard can update it
   *  in place instead of posting duplicates. Set by the publish action. */
  panelChannelId: snowflake,
  panelMessageId: snowflake,
  /** The panel posted by /form panel. */
  panel: z
    .object({
      title: z.string().max(256).default("Applications & Forms"),
      /** Blank = auto-list the forms with their descriptions. */
      description: z.string().max(4000).default(""),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default("#5865f2"),
    })
    .default({}),
});

export type FormsConfig = z.infer<typeof formsConfigSchema>;

// ---------------- Translation ----------------

export const translationConfigSchema = z.object({
  /** Auto-translate non-English messages posted in the server. */
  autoTranslate: z.boolean().default(false),
  /** Allow flag-emoji reactions to trigger a translation. */
  flagReactions: z.boolean().default(true),
  /** Target language for auto-translation (deep-translator/DeepL code). */
  targetLang: z.string().min(2).max(5).default("en"),

  // ---- Accuracy controls ----
  // The old gate translated anything franc failed to recognise as English,
  // which is why slang and gamer-speak misfired. These let a server tighten
  // that up without a code change.

  /**
   * How sure the detector must be (0-100) before we act on its guess.
   * Slangy English is exactly what detectors are worst at, so raising this is
   * the main lever against "it translated my English".
   */
  detectConfidence: z.number().int().min(0).max(100).default(70),
  /** When the detector isn't confident, skip instead of guessing. */
  requireConfidentDetect: z.boolean().default(true),
  /** Only translate FROM these languages. Empty = any language. */
  sourceLangs: z.array(z.string().min(2).max(5)).max(40).default([]),

  /** Messages shorter than this (after stripping links/emoji) are ignored. */
  minLength: z.number().int().min(1).max(500).default(12),

  /** Skip messages that are only chat slang. */
  skipSlang: z.boolean().default(true),
  /** The slang list itself, fully editable. */
  slangWords: z.array(z.string().min(1).max(40)).max(1000).default([]),

  /** Never translate a message containing one of these phrases. */
  neverTranslate: z.array(z.string().min(1).max(200)).max(500).default([]),
  /** Always translate a message containing one of these, skipping every check. */
  alwaysTranslate: z.array(z.string().min(1).max(200)).max(500).default([]),

  // ---- Scope ----
  ignoreChannelIds: z.array(z.string()).max(200).default([]),
  ignoreRoleIds: z.array(z.string()).max(100).default([]),
  ignoreUserIds: z.array(z.string()).max(200).default([]),
  ignoreBots: z.boolean().default(true),
  /** Don't translate messages that start with these (command prefixes). */
  ignoreCommandPrefixes: z
    .array(z.string().min(1).max(5))
    .max(20)
    .default(["!", "/", "?", ".", "-"]),
  /** Don't translate messages containing code blocks or inline code. */
  ignoreCodeBlocks: z.boolean().default(true),

  // ---- Output ----
  /** Show the translation as an embed (vs a plain reply). */
  useEmbed: z.boolean().default(true),
  /** Embed accent color. */
  embedColor: z.string().regex(/^#?[0-9a-fA-F]{6}$/).default("#5865f2"),
  /** Delete the translation after N seconds. 0 = keep it. */
  deleteAfterSec: z.number().int().min(0).max(3600).default(0),
});

export type TranslationConfig = z.infer<typeof translationConfigSchema>;

// ---------------- Auto-responder (events / lost items) ----------------

/** How a rule decides whether a message matches its trigger phrases. */
export const matchModeSchema = z.enum(["fuzzy", "contains", "word", "regex"]);
export type MatchMode = z.infer<typeof matchModeSchema>;

/**
 * One auto-response rule. Entirely server-defined: what to match, what NOT to
 * match, how loosely, where, how often, and what to say back.
 */
export const autoRuleSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  /** Staff-facing name, e.g. "Event questions". */
  name: z.string().min(1).max(80).default("New rule"),

  // ---- Matching ----
  /** Phrases that should trigger this rule. */
  triggers: z.array(z.string().min(1).max(300)).max(200).default([]),
  /** If any of these appear, never respond (e.g. "the event was fun"). */
  exclusions: z.array(z.string().min(1).max(300)).max(200).default([]),
  matchMode: matchModeSchema.default("fuzzy"),
  /**
   * How closely a message must match a trigger, 0-100. Only used in fuzzy
   * mode. Higher = stricter. ~60 is a good starting point.
   */
  threshold: z.number().int().min(0).max(100).default(60),
  /** Only fire on messages that look like questions. */
  questionsOnly: z.boolean().default(false),
  /** Ignore messages shorter than this (characters). */
  minLength: z.number().int().min(0).max(200).default(8),

  // ---- Response ----
  /** Plain message text. Supports {user}, {server}, {channel}. */
  responseText: z.string().max(2000).default(""),
  /** Send as an embed instead of plain text. */
  useEmbed: z.boolean().default(true),
  embedTitle: z.string().max(256).default(""),
  embedColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#5865f2"),
  /** Reply to the triggering message (vs posting a standalone message). */
  replyToUser: z.boolean().default(true),
  /** Delete the response after N seconds (0 = keep it). */
  deleteAfterSec: z.number().int().min(0).max(3600).default(0),

  // ---- Scoping ----
  /** Only run in these channels. Empty = every channel. */
  channelIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Never run in these channels. */
  ignoredChannelIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Members with any of these roles are ignored (e.g. staff). */
  ignoredRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Don't fire this rule again in the same channel for N seconds. */
  cooldownSec: z.number().int().min(0).max(86400).default(30),
});

export type AutoRule = z.infer<typeof autoRuleSchema>;

export const autoResponderConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Fully custom rules. Any server can build whatever responses it wants. */
  rules: z.array(autoRuleSchema).max(50).default([]),

  // ---- Legacy fields, kept so old configs still parse and can be migrated ----
  /** @deprecated Migrated into `rules`. */
  eventChannelId: snowflake,
  /** @deprecated Migrated into `rules`. */
  supportChannelId: snowflake,
  /** @deprecated Migrated into `rules`. */
  extraEventPhrases: z.array(z.string()).default([]),
});

export type AutoResponderConfig = z.infer<typeof autoResponderConfigSchema>;

// ---------------- Basic moderation (ported from Python) ----------------

export const moderationConfigSchema = z.object({
  /** Delete + warn on messages containing drug/substance terms. */
  drugFilter: z.boolean().default(false),
  /** Channel where only image posts are allowed (text-only gets deleted). */
  imageOnlyChannelId: snowflake,
  /** Custom banned words/phrases (case-insensitive, whole-word match). */
  bannedWordsEnabled: z.boolean().default(false),
  bannedWords: z.array(z.string().min(1).max(60)).max(200).default([]),
  /** Delete Discord invite links posted by non-staff. */
  blockInvites: z.boolean().default(false),
  /** Delete messages mentioning more than this many users/roles (0 = off). */
  maxMentions: z.number().int().min(0).max(50).default(0),
  /** Channel where filtered/deleted messages and mod cases are logged. */
  logChannelId: snowflake,
  /** Optional separate channel just for anti-spam reports. Falls back to logChannelId. */
  spamLogChannelId: snowflake,
  /** Roles exempt from all the filters above (staff, bots you trust). */
  exemptRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Role given by /mute. Set it up so the role denies Send Messages. */
  mutedRoleId: snowflake,

  // ---------------- Anti-spam / anti-scam ----------------
  /**
   * Catch the classic compromised-account crypto scam: the same message
   * blasted across many channels within seconds. No real member does this.
   */
  antiSpamEnabled: z.boolean().default(false),
  /** Delete + punish when the same text appears in this many channels... */
  crossPostChannels: z.number().int().min(2).max(20).default(3),
  /** ...within this many seconds. */
  crossPostWindowSec: z.number().int().min(5).max(300).default(30),
  /** Also catch the same message repeated this many times in ONE channel. */
  duplicateLimit: z.number().int().min(2).max(20).default(4),
  /** Delete messages that trip the built-in scam-phrase heuristics. */
  scamHeuristics: z.boolean().default(false),
  /** What to do with the spammer. */
  spamPunishment: z
    .enum(["delete", "timeout", "kick", "ban"])
    .default("timeout"),
  /** Timeout length in minutes when spamPunishment is "timeout". */
  spamTimeoutMin: z.number().int().min(1).max(40320).default(60),
  /** Delete every copy the spammer posted, not just the triggering one. */
  purgeAllCopies: z.boolean().default(true),

  /** Block ALL links from members without a role (blocks scam domains). */
  blockLinks: z.boolean().default(false),
  /** Domains always blocked, e.g. "kutwon.com". */
  blockedDomains: z.array(z.string().min(1).max(120)).max(200).default([]),
  /** Domains always allowed when blockLinks is on. */
  allowedDomains: z.array(z.string().min(1).max(120)).max(200).default([]),
  /**
   * Members whose account is younger than this many days can't post links.
   * Scam blasts almost always come from throwaway or freshly compromised
   * accounts. 0 = off.
   */
  minAccountAgeDaysForLinks: z.number().int().min(0).max(365).default(0),
});

export type ModerationConfig = z.infer<typeof moderationConfigSchema>;

// ---------------- Custom commands ----------------

/**
 * How the bot replies to a custom prefix command.
 *
 * Discord only allows truly-private (ephemeral) replies in response to an
 * INTERACTION, so a plain `!codes` message can't get one directly. "button"
 * works around that: the bot posts a button, and clicking it IS an
 * interaction, so the reveal is genuinely private to whoever clicked.
 */
export const customResponseModeSchema = z.enum([
  "button", // public button -> private (ephemeral) reveal for whoever clicks
  "dm", // DM the user, delete their command message
  "autodelete", // reply in channel, delete both after N seconds
  "public", // ordinary public reply
]);
export type CustomResponseMode = z.infer<typeof customResponseModeSchema>;

export const customCommandSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  /** The command word, without the prefix. e.g. "codes" for !codes */
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_-]+$/, "Lowercase letters, numbers, - and _ only"),
  /** Other words that trigger the same command, e.g. "code", "promo". */
  aliases: z.array(z.string().min(1).max(32)).max(10).default([]),
  /** What the bot says. Supports {user}, {server}, {channel}. */
  response: z.string().min(1).max(4000),
  responseMode: customResponseModeSchema.default("button"),
  /** Label on the reveal button, in "button" mode. */
  buttonLabel: z.string().max(80).default("Show me"),
  /** Seconds before the reply is deleted, in "autodelete" mode. */
  deleteAfterSec: z.number().int().min(3).max(300).default(30),
  /** Send the response as an embed. */
  useEmbed: z.boolean().default(true),
  embedTitle: z.string().max(256).default(""),
  embedColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#5865f2"),
  /** Also delete the member's command message (keeps channels tidy). */
  deleteTrigger: z.boolean().default(false),
  /** Only usable in these channels. Empty = anywhere. */
  channelIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Only usable by members with one of these roles. Empty = everyone. */
  allowedRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Per-user cooldown in seconds. */
  cooldownSec: z.number().int().min(0).max(3600).default(3),
  /** Bumped every time it's used, so you can see what's popular. */
  uses: z.number().int().min(0).default(0),
});

export type CustomCommand = z.infer<typeof customCommandSchema>;

export const customCommandsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** What members type before the command word, e.g. "!" for !codes */
  prefix: z.string().min(1).max(5).default("!"),
  commands: z.array(customCommandSchema).max(100).default([]),
});

export type CustomCommandsConfig = z.infer<typeof customCommandsConfigSchema>;

// ---------------- Welcome & Leave ----------------

/**
 * Greeter: welcome/leave messages, auto-roles on join, optional welcome DM.
 * Message templates support {user} (mention), {username}, {server}, and
 * {memberCount}.
 */
export const welcomeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Channel where welcome messages are posted. */
  channelId: snowflake,
  message: z
    .string()
    .max(2000)
    .default("Welcome to {server}, {user}! You are member #{memberCount}."),
  /** Also DM the new member. */
  dmEnabled: z.boolean().default(false),
  dmMessage: z
    .string()
    .max(2000)
    .default("Welcome to {server}! Check out the rules channel to get started."),
  /** Roles granted automatically on join. */
  joinRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Leave messages. */
  leaveEnabled: z.boolean().default(false),
  leaveChannelId: snowflake,
  leaveMessage: z.string().max(2000).default("{username} has left {server}."),
});

export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;

// ---------------- Dashboard access ----------------

/**
 * Who may log into the dashboard for this guild, beyond users with Manage
 * Server (who always have access). Lets you grant specific staff roles.
 */
export const accessConfigSchema = z.object({
  /** Role IDs whose holders may access the dashboard. */
  staffRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Extra user IDs always allowed (owner is always allowed regardless). */
  allowUserIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
});

export type AccessConfig = z.infer<typeof accessConfigSchema>;

// ---------------- Registry ----------------

/** Map a feature key to its schema so callers can validate generically. */
export const FEATURE_SCHEMAS = {
  tickets: ticketConfigSchema,
  forms: formsConfigSchema,
  translation: translationConfigSchema,
  autoresponder: autoResponderConfigSchema,
  moderation: moderationConfigSchema,
  welcome: welcomeConfigSchema,
  customcommands: customCommandsConfigSchema,
  access: accessConfigSchema,
} as const;

export { z };
