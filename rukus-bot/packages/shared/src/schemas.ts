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
   * Whether this form appears on the SHARED panel, the single "Applications"
   * hub that lists every form as a button. Turn OFF for forms that only exist
   * as pre-ticket questionnaires attached to ticket types, or for forms you
   * publish on their own panel instead (see ownPanel).
   */
  showOnPanel: z.boolean().default(true),

  /**
   * Give this form its OWN panel message, separate from the shared one.
   *
   * The shared panel puts every form on one embed, which is wrong as soon as
   * two forms want different wording, different colors, or to live in different
   * channels ("Content Creator Application" and "Staff Application" are not the
   * same announcement). With this on, the form gets a panel of its own with a
   * single button, published to its own channel.
   */
  ownPanel: z.boolean().default(false),
  panelTitle: z.string().max(256).default(""),
  panelDescription: z.string().max(4000).default(""),
  panelColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#5865f2"),
  /** Where this form's own panel lives, so it can be edited in place. */
  panelChannelId: snowflake,
  panelMessageId: snowflake,
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

  /**
   * How many words of 3+ letters a message needs before we trust ANY language
   * detection of it. Character length is not enough: "gm jakey poo" clears a
   * 12-character minimum but is a name and two abbreviations, and detectors
   * confidently mislabel it (that exact message was translated from
   * "Pangasinan"). Raising this is the cure for short-message misfires.
   */
  minWords: z.number().int().min(1).max(20).default(3),

  /** Skip messages that are only chat slang. */
  skipSlang: z.boolean().default(true),
  /** The slang list itself, fully editable. */
  slangWords: z.array(z.string().min(1).max(40)).max(1000).default([]),

  /** Never translate a message containing one of these phrases. */
  neverTranslate: z.array(z.string().min(1).max(200)).max(500).default([]),
  /** Always translate a message containing one of these, skipping every check. */
  alwaysTranslate: z.array(z.string().min(1).max(200)).max(500).default([]),

  // ---- Scope ----
  /**
   * Only auto-translate in these channels. Empty means every channel, which is
   * the old behaviour. An allowlist is what most servers actually want: a
   * translation reply in every channel is noise, and blocklisting them one by
   * one never keeps up with new channels.
   */
  onlyChannelIds: z.array(z.string()).max(200).default([]),
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
  /**
   * Run the response through the TagScript engine ({user}, {if}, {random}...).
   * Off means the response is sent verbatim, which is the escape hatch for
   * text that legitimately contains braces.
   */
  tagscript: z.boolean().default(true),
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

// ---------------- Reaction roles ----------------

/**
 * How a panel treats a member picking one of its roles.
 *
 * normal   - toggle: pick to add, pick again to remove
 * unique   - only one role from this panel at a time (picking swaps)
 * verify   - add only; a member can never take the role back off
 * drop     - remove only; picking takes the role away
 * reversed - inverted toggle: reacting REMOVES, un-reacting adds
 * binding  - verify + unique: one role, and it can never be swapped or removed
 * limit    - up to maxRoles from this panel
 * lock     - frozen: nothing is granted or removed (an announcement/pause state)
 */
export const reactionRoleModeSchema = z.enum([
  "normal",
  "unique",
  "verify",
  "drop",
  "reversed",
  "binding",
  "limit",
  "lock",
]);
export type ReactionRoleMode = z.infer<typeof reactionRoleModeSchema>;

/**
 * How the panel is rendered. Reactions are the legacy Carl-style approach and
 * are fragile (a member can strip a reaction, Discord rate-limits them, and the
 * emoji must be usable in the guild). Buttons and dropdowns are interactions:
 * they are instant, ephemeral-confirmable, and cannot be spoofed, so they are
 * the recommended default.
 */
export const reactionRoleStyleSchema = z.enum([
  "reactions",
  "buttons",
  "dropdown",
]);
export type ReactionRoleStyle = z.infer<typeof reactionRoleStyleSchema>;

/** Discord's button colors, for "buttons" style panels. */
export const buttonStyleSchema = z.enum([
  "primary",
  "secondary",
  "success",
  "danger",
]);
export type ButtonStyle = z.infer<typeof buttonStyleSchema>;

/** One emoji/button/option on a panel, bound to exactly one role. */
export const reactionRolePairSchema = z.object({
  /** Unicode emoji or a custom emoji like <:name:id>. Optional for buttons. */
  emoji: z.string().max(64).default(""),
  roleId: z.string().regex(/^\d{17,20}$/),
  /**
   * Button label / dropdown option description. In "reactions" style this is
   * what gets listed in the embed body next to the emoji.
   */
  description: z.string().max(100).default(""),
});

export type ReactionRolePair = z.infer<typeof reactionRolePairSchema>;

export const reactionRolePanelSchema = z.object({
  id: z.string().min(1),
  channelId: snowflake,
  /**
   * Null until the panel is posted. Stored so re-publishing edits the existing
   * message in place instead of littering the channel with duplicates.
   */
  messageId: z.string().regex(/^\d{17,20}$/).nullable().default(null),
  title: z.string().max(256).default("Pick your roles"),
  description: z.string().max(4000).default(""),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#5865f2"),
  mode: reactionRoleModeSchema.default("normal"),
  style: reactionRoleStyleSchema.default("buttons"),
  /** Only used in "limit" mode: how many of this panel's roles are allowed. */
  maxRoles: z.number().int().min(1).max(25).default(1),
  /** Button color, for "buttons" style panels. */
  buttonStyle: buttonStyleSchema.default("secondary"),
  /** Dropdown placeholder text, for "dropdown" style panels. */
  placeholder: z.string().max(150).default("Select a role"),
  /** Member must hold one of these to use the panel (e.g. Verified). */
  requiredRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Member holding any of these is refused (e.g. Muted can't self-role). */
  blockedRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  /** Discord caps both dropdown options and reactions on a message at 25/20. */
  pairs: z.array(reactionRolePairSchema).max(25).default([]),
});

export type ReactionRolePanel = z.infer<typeof reactionRolePanelSchema>;

export const reactionRolesConfigSchema = z.object({
  enabled: z.boolean().default(false),
  panels: z.array(reactionRolePanelSchema).max(50).default([]),
});

export type ReactionRolesConfig = z.infer<typeof reactionRolesConfigSchema>;

// ---------------- Logging ----------------

/**
 * Audit logging. Streams are split so a busy message log can live somewhere
 * staff can mute, while joins/bans stay visible. Any unset stream channel falls
 * back to defaultChannelId, so a server can start with one channel and split
 * later without touching the event toggles.
 */
export const loggingConfigSchema = z.object({
  enabled: z.boolean().default(false),

  // ---- Destinations ----
  /** Fallback for every stream that has no channel of its own. */
  defaultChannelId: snowflake,
  messageChannelId: snowflake,
  memberChannelId: snowflake,
  serverChannelId: snowflake,
  voiceChannelId: snowflake,
  joinChannelId: snowflake,

  // ---- Message events ----
  messageDelete: z.boolean().default(true),
  messageEdit: z.boolean().default(true),
  messageBulkDelete: z.boolean().default(true),

  // ---- Member events ----
  memberJoin: z.boolean().default(true),
  memberLeave: z.boolean().default(true),
  memberBan: z.boolean().default(true),
  memberUnban: z.boolean().default(true),
  memberKick: z.boolean().default(true),
  memberRoleChange: z.boolean().default(true),
  memberNickChange: z.boolean().default(true),
  memberAvatarChange: z.boolean().default(false),

  // ---- Server events ----
  channelCreate: z.boolean().default(true),
  channelDelete: z.boolean().default(true),
  channelUpdate: z.boolean().default(false),
  roleCreate: z.boolean().default(true),
  roleDelete: z.boolean().default(true),
  roleUpdate: z.boolean().default(false),
  emojiUpdate: z.boolean().default(false),
  serverUpdate: z.boolean().default(false),
  inviteCreate: z.boolean().default(false),
  inviteDelete: z.boolean().default(false),

  // ---- Voice events ----
  voiceJoin: z.boolean().default(false),
  voiceLeave: z.boolean().default(false),
  voiceMove: z.boolean().default(false),

  // ---- Scope ----
  ignoreChannelIds: z.array(z.string().regex(/^\d{17,20}$/)).max(200).default([]),
  ignoreUserIds: z.array(z.string().regex(/^\d{17,20}$/)).max(200).default([]),
  ignoreBots: z.boolean().default(true),
  /**
   * Skip messages starting with these. Other bots' command invocations are the
   * single biggest source of log noise, and nobody needs an edit log entry for
   * someone mistyping "!rank".
   */
  ignorePrefixes: z.array(z.string().min(1).max(5)).max(20).default([]),
});

export type LoggingConfig = z.infer<typeof loggingConfigSchema>;

// ---------------- Starboard ----------------

/**
 * Starboard: messages the server reacts to enough get mirrored to a highlights
 * channel. Threshold and emoji are per-guild because what counts as "notable"
 * scales with how big and how chatty the server is.
 */
export const starboardConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Where starred messages get mirrored. */
  channelId: snowflake,
  /** Unicode emoji or a custom emoji like <:star:123>. */
  emoji: z.string().min(1).max(64).default("⭐"),
  /** Reactions needed before a message is posted to the board. */
  threshold: z.number().int().min(1).max(100).default(3),
  /** Let people star their own message. Off by default: it's trivially gamed. */
  allowSelfStar: z.boolean().default(false),
  /** Mirror messages from NSFW channels (the board is usually not NSFW). */
  allowNsfw: z.boolean().default(false),
  ignoreChannelIds: z.array(z.string().regex(/^\d{17,20}$/)).max(200).default([]),
  /** Messages from members with these roles are never starred. */
  ignoreRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).max(100).default([]),
  embedColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#f1c40f"),
  /** Include a link back to the original message. */
  showJumpLink: z.boolean().default(true),
});

export type StarboardConfig = z.infer<typeof starboardConfigSchema>;

// ---------------- Auto roles ----------------

/** A role granted some time after joining, e.g. a "Regular" role after a day. */
export const timedRoleSchema = z.object({
  roleId: z.string().regex(/^\d{17,20}$/),
  /** Seconds after join before the role is granted. */
  delaySec: z.number().int().min(1).max(31_536_000).default(3600),
});

export type TimedRole = z.infer<typeof timedRoleSchema>;

export const autoRolesConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Roles granted to human members on join. */
  joinRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).max(25).default([]),
  /** Bots get these INSTEAD of joinRoleIds, so they skip member-only roles. */
  botRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).max(25).default([]),
  /**
   * Give a returning member the roles they had when they left ("sticky roles").
   * Roles are snapshotted on leave into MemberRoleBackup.
   */
  restoreRoles: z.boolean().default(false),
  /**
   * Roles that are NEVER restored. This exists because restoring blindly turns
   * leaving and rejoining into a free mute-evade: the member drops the muted
   * role on the way out and we would hand it straight back... or rather, we
   * would NOT, which is the bug. Put the muted role and any staff role here so
   * a rejoin can neither clear a punishment nor silently regrant power.
   */
  restoreBlockedRoleIds: z
    .array(z.string().regex(/^\d{17,20}$/))
    .max(50)
    .default([]),
  /** Roles handed out on a delay after join. */
  timedRoles: z.array(timedRoleSchema).max(25).default([]),
});

export type AutoRolesConfig = z.infer<typeof autoRolesConfigSchema>;

// ---------------- Leveling ----------------

/** A role granted when a member reaches a level. */
export const roleRewardSchema = z.object({
  level: z.number().int().min(1).max(1000),
  roleId: z.string().regex(/^\d{17,20}$/),
});

export type RoleReward = z.infer<typeof roleRewardSchema>;

/** Boosters/patrons can be given faster XP without touching the base rate. */
export const xpMultiplierRoleSchema = z.object({
  roleId: z.string().regex(/^\d{17,20}$/),
  /** Multiplies earned XP. 2 = double XP. */
  multiplier: z.number().min(0).max(10).default(1),
});

export type XpMultiplierRole = z.infer<typeof xpMultiplierRoleSchema>;

/** Per-channel XP weighting: 0 kills XP in a channel, 2 doubles it. */
export const channelMultiplierSchema = z.object({
  channelId: z.string().regex(/^\d{17,20}$/),
  multiplier: z.number().min(0).max(10).default(1),
});

export type ChannelMultiplier = z.infer<typeof channelMultiplierSchema>;

/**
 * The rank card image. This is the whole reason members care about leveling, so
 * every part of it is server-editable rather than a hardcoded theme.
 */
export const rankCardSchema = z.object({
  /** Image drawn behind the card. Empty = flat backgroundColor. */
  backgroundUrl: z.string().url().or(z.literal("")).default(""),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#23272a"),
  /** Progress bar fill. */
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#5865f2"),
  textColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
  subTextColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#b9bbbe"),
  barBackground: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#484b51"),
  showRank: z.boolean().default(true),
  showXpNumbers: z.boolean().default(true),
  /**
   * Strength of the dark scrim drawn over backgroundUrl, 0-100. A member's
   * chosen wallpaper is arbitrary, and white text on a bright image is
   * unreadable, so the card always has a dimmer it can lean on.
   */
  opacity: z.number().int().min(0).max(100).default(60),
});

export type RankCard = z.infer<typeof rankCardSchema>;

export const levelingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** XP per qualifying message is rolled in this range, so it can't be farmed
   *  to an exact predictable number. */
  xpPerMessageMin: z.number().int().min(0).max(1000).default(15),
  xpPerMessageMax: z.number().int().min(0).max(1000).default(25),
  /** Only one message per member per this many seconds earns XP (anti-spam). */
  cooldownSec: z.number().int().min(0).max(3600).default(60),
  announceLevelUp: z.boolean().default(true),
  /** Null = reply in the channel where they levelled up. */
  announceChannelId: snowflake,
  /** Supports {user}, {username}, {level}, {server}. */
  announceMessage: z
    .string()
    .max(2000)
    .default("GG {user}, you reached level {level}!"),
  roleRewards: z.array(roleRewardSchema).max(100).default([]),
  /**
   * Keep every reward role earned so far. Off = the new reward replaces the
   * previous one, which is what you want when the rewards are a single ladder
   * of colored rank roles.
   */
  stackRoleRewards: z.boolean().default(false),
  ignoreChannelIds: z.array(z.string().regex(/^\d{17,20}$/)).max(200).default([]),
  /** Members with these roles earn no XP (bots-with-roles, staff alt accounts). */
  ignoreRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).max(100).default([]),
  xpMultiplierRoles: z.array(xpMultiplierRoleSchema).max(50).default([]),

  /** The /rank image. */
  card: rankCardSchema.default({}),

  // ---- Voice XP ----
  /** Award XP for time spent in voice, not just for typing. */
  voiceXpEnabled: z.boolean().default(false),
  voiceXpPerMinute: z.number().int().min(0).max(100).default(5),
  /** No XP for sitting alone in a channel: that is a farm, not a conversation. */
  voiceMinMembers: z.number().int().min(1).max(50).default(2),
  /** No XP in the server's AFK channel. */
  voiceIgnoreAfk: z.boolean().default(true),
  /** Self-muted means not participating, so it earns nothing. */
  voiceIgnoreMuted: z.boolean().default(true),
  voiceIgnoreChannelIds: z
    .array(z.string().regex(/^\d{17,20}$/))
    .max(200)
    .default([]),

  // ---- Depth ----
  /** Weight XP per channel, e.g. half XP in #spam, none in #bot-commands. */
  channelMultipliers: z.array(channelMultiplierSchema).max(50).default([]),
  /** DM the level-up instead of posting it, for servers that hate the noise. */
  levelUpDm: z.boolean().default(false),
  /** Take the reward role back when a member drops below its level. */
  removeRoleOnLevelDown: z.boolean().default(true),
  /** Server-wide difficulty slider applied on top of every other multiplier. */
  xpRate: z.number().min(0.25).max(3).default(1),
  /** Serve /leaderboard/<guildId> to anyone, not just dashboard staff. */
  publicLeaderboard: z.boolean().default(true),
});

export type LevelingConfig = z.infer<typeof levelingConfigSchema>;

// ---------------- Suggestions ----------------

export const suggestionsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Where members post suggestions and where they're voted on. */
  channelId: snowflake,
  /**
   * Optional separate channel for approved/denied decisions. Keeps the voting
   * channel from filling up with resolved items. Unset = decide in place.
   */
  decisionChannelId: snowflake,
  /** Hide the author, so people will actually suggest unpopular things. */
  anonymous: z.boolean().default(false),
  upvoteEmoji: z.string().min(1).max(64).default("⬆️"),
  downvoteEmoji: z.string().min(1).max(64).default("⬇️"),
  allowVoting: z.boolean().default(true),
  /** Open a thread on each suggestion so discussion stays off the main feed. */
  threadPerSuggestion: z.boolean().default(false),
});

export type SuggestionsConfig = z.infer<typeof suggestionsConfigSchema>;

// ---------------- Giveaways ----------------

export const giveawaysConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Reaction members use to enter. */
  emoji: z.string().min(1).max(64).default("🎉"),
  /** Who may start a giveaway. Empty = Manage Server only. */
  hostRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).max(25).default([]),
  embedColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#5865f2"),
  /** DM winners, so a win isn't missed in a fast channel. */
  dmWinners: z.boolean().default(true),
});

export type GiveawaysConfig = z.infer<typeof giveawaysConfigSchema>;

// ---------------- Reminders ----------------

export const remindersConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Cap per member, so nobody can queue thousands of timers. */
  maxPerUser: z.number().int().min(1).max(100).default(10),
});

export type RemindersConfig = z.infer<typeof remindersConfigSchema>;

// ---------------- Highlights ----------------

/**
 * Highlights DM a member when a word they care about is said. The words
 * themselves are per-user data and live in the Highlight table, not here: only
 * the guild-wide limits are config.
 */
export const highlightsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  maxPerUser: z.number().int().min(1).max(100).default(10),
  /** Don't DM the same member again for this many seconds. */
  cooldownSec: z.number().int().min(0).max(3600).default(300),
});

export type HighlightsConfig = z.infer<typeof highlightsConfigSchema>;

// ---------------- AFK ----------------

export const afkConfigSchema = z.object({
  enabled: z.boolean().default(false),
});

export type AfkConfig = z.infer<typeof afkConfigSchema>;

// ---------------- Utility ----------------

/**
 * Small standalone tools. They're grouped rather than given a feature key each
 * so the dashboard doesn't grow a page per one-liner.
 */
export const utilityConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** /poll */
  polls: z.boolean().default(true),
  /** The staff embed builder (/embed). */
  embedBuilder: z.boolean().default(true),
});

export type UtilityConfig = z.infer<typeof utilityConfigSchema>;

// ---------------- Social alerts ----------------

/** Where a feed comes from. Each type reads `source` differently. */
export const socialFeedTypeSchema = z.enum(["youtube", "twitch", "rss"]);
export type SocialFeedType = z.infer<typeof socialFeedTypeSchema>;

/** One watched creator/feed and the announcement it produces. */
export const socialFeedSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  type: socialFeedTypeSchema.default("youtube"),
  /** Channel/user id for youtube, login name for twitch, url for rss. */
  source: z.string().min(1).max(300),
  /** Staff-facing name, also the {name} placeholder. */
  displayName: z.string().min(1).max(80),
  postChannelId: snowflake,
  /** Supports {name}, {link}, {title}, {everyone}, {here}, {role}. */
  message: z
    .string()
    .max(2000)
    .default("{everyone} **{name}** is live!\n{link}"),
  mentionRoleId: snowflake,
  /** Twitch only: give this role while they are live, remove when offline. */
  liveRoleId: snowflake,
  embedColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#5865f2"),
  /**
   * Last video/stream/item we announced. The dedupe key: without it a poll that
   * restarts re-announces the newest item on every tick.
   */
  lastItemId: z.string().default(""),
});

export type SocialFeed = z.infer<typeof socialFeedSchema>;

export const socialAlertsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  feeds: z.array(socialFeedSchema).max(25).default([]),
});

export type SocialAlertsConfig = z.infer<typeof socialAlertsConfigSchema>;

// ---------------- Birthdays ----------------

/**
 * Birthdays themselves are per-user data and live in the Birthday table; only
 * the guild-wide announcement settings are config.
 */
export const birthdaysConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Where the announcement is posted. */
  channelId: snowflake,
  /** Supports {user}, {username}, {server}, {age}. */
  message: z.string().max(2000).default("🎂 Happy birthday {user}!"),
  /** Given for the day, then taken back. */
  birthdayRoleId: snowflake,
  /** Local hour (in `timezone`) the announcement fires at. */
  announceHour: z.number().int().min(0).max(23).default(12),
  /** IANA zone, e.g. "Europe/London". The guild's day, not the server's. */
  timezone: z.string().min(1).max(64).default("UTC"),
});

export type BirthdaysConfig = z.infer<typeof birthdaysConfigSchema>;

// ---------------- Invite tracker ----------------

export const inviteTrackerConfigSchema = z.object({
  enabled: z.boolean().default(false),
  logChannelId: snowflake,
  /** Supports {user}, {username}, {inviter}, {invites}, {code}, {server}. */
  message: z
    .string()
    .max(2000)
    .default("{user} joined, invited by {inviter} ({invites} invites)"),
});

export type InviteTrackerConfig = z.infer<typeof inviteTrackerConfigSchema>;

// ---------------- Temp voice ----------------

export const tempVoiceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Joining this channel creates a personal voice channel. */
  lobbyChannelId: snowflake,
  /** Where the personal channels are created. */
  categoryId: snowflake,
  /** Supports {user}, {username}. */
  nameTemplate: z.string().min(1).max(90).default("{username}'s channel"),
  /** Discord's own cap; 0 = unlimited. */
  userLimit: z.number().int().min(0).max(99).default(0),
});

export type TempVoiceConfig = z.infer<typeof tempVoiceConfigSchema>;

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
  reactionroles: reactionRolesConfigSchema,
  logging: loggingConfigSchema,
  starboard: starboardConfigSchema,
  autoroles: autoRolesConfigSchema,
  leveling: levelingConfigSchema,
  suggestions: suggestionsConfigSchema,
  giveaways: giveawaysConfigSchema,
  reminders: remindersConfigSchema,
  highlights: highlightsConfigSchema,
  afk: afkConfigSchema,
  utility: utilityConfigSchema,
  socialalerts: socialAlertsConfigSchema,
  birthdays: birthdaysConfigSchema,
  invitetracker: inviteTrackerConfigSchema,
  tempvoice: tempVoiceConfigSchema,
} as const;

export { z };
