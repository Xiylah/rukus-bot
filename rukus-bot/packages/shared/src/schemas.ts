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
});

export type TranslationConfig = z.infer<typeof translationConfigSchema>;

// ---------------- Auto-responder (events / lost items) ----------------

export const autoResponderConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Channel referenced in the "check the events channel" reply. */
  eventChannelId: snowflake,
  /** Channel referenced in the "open a support ticket" reply for lost items. */
  supportChannelId: snowflake,
  /** Extra event phrasings learned/added on top of the built-in bank. */
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
  /** Channel where filtered/deleted messages are logged for staff. */
  logChannelId: snowflake,
  /** Roles exempt from all the filters above (staff, bots you trust). */
  exemptRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
});

export type ModerationConfig = z.infer<typeof moderationConfigSchema>;

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
  access: accessConfigSchema,
} as const;

export { z };
