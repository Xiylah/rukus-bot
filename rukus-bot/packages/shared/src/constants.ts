/**
 * Constants shared between the bot and the dashboard.
 * Keeping them here guarantees both sides agree on colors, IDs, and limits.
 */

/** Brand colors used in embeds (hex ints for discord.js). */
export const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  neutral: 0x2b2d31,
} as const;

/** Feature keys - used as stable identifiers in the DB and dashboard routes. */
export const FEATURES = {
  tickets: "tickets",
  forms: "forms",
  moderation: "moderation",
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

/**
 * Custom-id namespaces for Discord components (buttons, selects, modals).
 * Format: `${NS}:${action}:${...args}` - parsed in the interaction router.
 * Keep these short; Discord custom_ids are capped at 100 characters.
 */
export const CID = {
  ticketOpen: "tkt:open",
  ticketClaim: "tkt:claim",
  ticketClose: "tkt:close",
  ticketCloseConfirm: "tkt:closeconfirm",
  ticketReopen: "tkt:reopen",
  ticketDelete: "tkt:delete",
  ticketModal: "tkt:modal",
  ticketRate: "tkt:rate",
  formOpen: "frm:open",
  formModal: "frm:modal",
  formApprove: "frm:approve",
  formDeny: "frm:deny",
} as const;

/** Discord platform limits we must respect when building UIs. */
export const DISCORD_LIMITS = {
  customId: 100,
  modalComponents: 5, // max input fields per modal
  embedFields: 25,
  buttonLabel: 80,
  selectOptions: 25,
} as const;

/** Ticket lifecycle states, mirrored in the Prisma enum. */
export const TICKET_STATUS = {
  open: "OPEN",
  claimed: "CLAIMED",
  closed: "CLOSED",
} as const;

/** Form submission review states, mirrored in the Prisma enum. */
export const SUBMISSION_STATUS = {
  pending: "PENDING",
  approved: "APPROVED",
  denied: "DENIED",
} as const;
