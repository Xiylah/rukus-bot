import { hexToInt, type PanelPayload } from "./panels.js";
import type {
  ReactionRoleMode,
  ReactionRolePair,
  ReactionRolePanel,
} from "./schemas.js";

/**
 * Reaction-role panels: payload builder + the pure decision logic.
 *
 * Kept in @rukus/shared for the same reason the ticket panel is: the dashboard
 * publishes panels over REST and the bot publishes them over the gateway, and
 * both must produce byte-identical messages or "Post to Discord" and
 * /reactionroles post would drift apart. The decision function lives here too so
 * the dashboard can explain each mode with the same rules the bot enforces.
 */

/**
 * Custom-id namespaces for reaction-role components. These mirror the CID
 * convention in constants.ts (`${ns}:${action}:${args}`) but live here so this
 * feature can ship without touching the shared constants file.
 */
export const RR_CID = {
  /** rr:b:<panelId>:<roleId> */
  button: "rr:b",
  /** rr:s:<panelId> */
  select: "rr:s",
} as const;

export const rrButtonId = (panelId: string, roleId: string) =>
  `${RR_CID.button}:${panelId}:${roleId}`;

export const rrSelectId = (panelId: string) => `${RR_CID.select}:${panelId}`;

/** Pull the panel id (and role id, for buttons) back out of a custom id. */
export function parseRrCustomId(
  customId: string,
): { panelId: string; roleId?: string } | null {
  const parts = customId.split(":");
  if (parts[0] !== "rr") return null;
  if (parts[1] === "b" && parts[2] && parts[3]) {
    return { panelId: parts[2], roleId: parts[3] };
  }
  if (parts[1] === "s" && parts[2]) return { panelId: parts[2] };
  return null;
}

// ---------------- Emoji ----------------

const CUSTOM_EMOJI = /^<a?:([A-Za-z0-9_]+):(\d{17,20})>$/;

/**
 * The identity of an emoji as Discord reports it on a reaction: the snowflake
 * for custom emoji, the literal character for unicode ones. Storing "<:x:123>"
 * in config but receiving `{ id: "123" }` on the gateway is the classic
 * reaction-roles bug, so every comparison goes through this.
 */
export function emojiKey(raw: string): string {
  const m = CUSTOM_EMOJI.exec(raw.trim());
  return m ? m[2]! : raw.trim();
}

/** Emoji shaped for the components API, or undefined when there is none. */
export function apiEmojiFor(
  raw: string,
): { id: string; name: string; animated: boolean } | { name: string } | undefined {
  const e = raw.trim();
  if (!e) return undefined;
  const m = CUSTOM_EMOJI.exec(e);
  if (m) return { id: m[2]!, name: m[1]!, animated: e.startsWith("<a:") };
  // Plain ASCII is not an emoji and would 400 the request.
  if (/^[\x00-\x7F]*$/.test(e)) return undefined;
  return { name: e };
}

/**
 * Emoji shaped for the reactions REST route, which wants `name:id` for custom
 * emoji and the bare character for unicode ones (both url-encoded by the caller).
 */
export function reactionEmojiFor(raw: string): string | null {
  const e = raw.trim();
  if (!e) return null;
  const m = CUSTOM_EMOJI.exec(e);
  if (m) return `${m[1]}:${m[2]}`;
  if (/^[\x00-\x7F]*$/.test(e)) return null;
  return e;
}

/** The pair on this panel bound to a given emoji, if any. */
export function pairForEmoji(
  panel: ReactionRolePanel,
  key: string,
): ReactionRolePair | undefined {
  return panel.pairs.find((p) => p.emoji && emojiKey(p.emoji) === key);
}

// ---------------- Panel payload ----------------

/** Human-readable explanations, shown in the dashboard mode picker. */
export const MODE_HELP: Record<ReactionRoleMode, string> = {
  normal:
    "Toggle. Picking a role gives it, picking it again takes it away. Members can hold as many of this panel's roles as they like.",
  unique:
    "One at a time. Picking a role removes every other role on this panel, so a member can only ever hold one of them (colours, pronouns, teams).",
  verify:
    "Give only. The role is granted and never taken away by this panel. The reaction is cleared straight after so the panel stays clean.",
  drop: "Take away only. Picking a role REMOVES it. Useful for opt-out panels.",
  reversed:
    "Inverted. With reactions, reacting REMOVES the role and un-reacting gives it back. With buttons or a dropdown it behaves as a toggle.",
  binding:
    "Permanent choice. One role from this panel, and once it is picked it can never be swapped or removed.",
  limit:
    "Capped. Members may hold up to a set number of this panel's roles; picking past the cap is refused.",
  lock: "Frozen. Nothing is granted or removed. Use this to pause a panel without deleting it.",
};

/** The label a pair shows on a button or dropdown option. */
export function pairLabel(
  pair: ReactionRolePair,
  roleNames?: Record<string, string>,
): string {
  return pair.description.trim() || roleNames?.[pair.roleId] || "Role";
}

/**
 * The role list appended to a "reactions" panel's embed, since a reaction on
 * its own tells a member nothing about what it grants.
 */
export function reactionLegend(
  panel: ReactionRolePanel,
  roleNames?: Record<string, string>,
): string {
  return panel.pairs
    .map((p) => {
      const label = p.description.trim() || roleNames?.[p.roleId];
      return `${p.emoji} <@&${p.roleId}>${label ? ` - ${label}` : ""}`;
    })
    .join("\n");
}

const BUTTON_STYLE_INT = {
  primary: 1,
  secondary: 2,
  success: 3,
  danger: 4,
} as const;

/** Max options a member may pick at once from a dropdown panel. */
export function selectMaxValues(panel: ReactionRolePanel): number {
  const count = Math.max(1, panel.pairs.length);
  switch (panel.mode) {
    case "unique":
    case "binding":
      return 1;
    case "limit":
      return Math.min(panel.maxRoles, count);
    default:
      return count;
  }
}

/**
 * The panel message. Plain Discord API JSON (not discord.js builders) so the
 * dashboard can POST it and the bot can pass it straight to channel.send().
 */
export function buildReactionRolePanelPayload(
  panel: ReactionRolePanel,
  roleNames?: Record<string, string>,
): PanelPayload {
  const legend =
    panel.style === "reactions" && panel.pairs.length > 0
      ? reactionLegend(panel, roleNames)
      : "";
  const description = [panel.description.trim(), legend]
    .filter(Boolean)
    .join("\n\n");

  const embed = {
    title: panel.title,
    description: description || "Pick a role below.",
    color: hexToInt(panel.color),
  };

  if (panel.style === "reactions" || panel.pairs.length === 0) {
    return { embeds: [embed], components: [] };
  }

  if (panel.style === "dropdown") {
    return {
      embeds: [embed],
      components: [
        {
          type: 1, // action row
          components: [
            {
              type: 3, // string select
              custom_id: rrSelectId(panel.id),
              placeholder: panel.placeholder.slice(0, 150),
              // 0 lets a member close the menu without picking anything.
              min_values: 0,
              max_values: selectMaxValues(panel),
              options: panel.pairs.slice(0, 25).map((p) => ({
                label: pairLabel(p, roleNames).slice(0, 100),
                value: p.roleId,
                emoji: apiEmojiFor(p.emoji),
              })),
            },
          ],
        },
      ],
    };
  }

  // Buttons: 5 per row, 5 rows, which is exactly the 25-pair schema cap.
  const rows: object[] = [];
  for (let i = 0; i < panel.pairs.length && rows.length < 5; i += 5) {
    rows.push({
      type: 1,
      components: panel.pairs.slice(i, i + 5).map((p) => ({
        type: 2, // button
        style: BUTTON_STYLE_INT[panel.buttonStyle],
        // An emoji-only button is legal, and is what most colour panels want.
        label: p.description.trim()
          ? p.description.trim().slice(0, 80)
          : p.emoji
            ? undefined
            : pairLabel(p, roleNames).slice(0, 80),
        custom_id: rrButtonId(panel.id, p.roleId),
        emoji: apiEmojiFor(p.emoji),
      })),
    });
  }

  return { embeds: [embed], components: rows };
}

// ---------------- Decision logic ----------------

/** What the panel does to a member, decided without touching Discord. */
export interface RrDecision {
  add: string[];
  remove: string[];
  /**
   * Whether the member's reaction should be stripped from the panel message.
   * Modes that only ever grant (verify, binding) clear it so the button can be
   * used again, and a refusal clears it so the panel doesn't lie about what the
   * member holds.
   */
  clearReaction: boolean;
  /** Ephemeral feedback for component panels. Empty when there is nothing to say. */
  message: string;
}

export interface RrContext {
  panel: ReactionRolePanel;
  /** The pair the member interacted with. */
  pair: ReactionRolePair;
  /** Every role the member currently holds. */
  memberRoleIds: string[];
  /**
   * Reactions distinguish "added" from "removed"; a button or dropdown pick is
   * always a single "picked" event that toggles.
   */
  source: "reaction" | "component";
  /** For reactions only: which half of the event this is. */
  event?: "add" | "remove";
}

const NOTHING = (message = ""): RrDecision => ({
  add: [],
  remove: [],
  clearReaction: false,
  message,
});

/**
 * The single source of truth for what every mode does. Both the raw reaction
 * handler and the button/dropdown handler funnel through here, so a panel
 * cannot behave one way as reactions and another as buttons.
 */
export function decideReactionRole(ctx: RrContext): RrDecision {
  const { panel, pair, memberRoleIds, source } = ctx;
  const roleId = pair.roleId;
  const has = memberRoleIds.includes(roleId);
  const otherPanelRoles = panel.pairs
    .map((p) => p.roleId)
    .filter((r) => r !== roleId && memberRoleIds.includes(r));
  const heldOnPanel = otherPanelRoles.length + (has ? 1 : 0);

  if (panel.mode === "lock") {
    return {
      add: [],
      remove: [],
      clearReaction: true,
      message: "This panel is locked right now.",
    };
  }

  if (
    panel.requiredRoleIds.length > 0 &&
    !panel.requiredRoleIds.some((r) => memberRoleIds.includes(r))
  ) {
    return {
      add: [],
      remove: [],
      clearReaction: true,
      message: `You need ${panel.requiredRoleIds
        .map((r) => `<@&${r}>`)
        .join(" or ")} to use this panel.`,
    };
  }

  if (panel.blockedRoleIds.some((r) => memberRoleIds.includes(r))) {
    return {
      add: [],
      remove: [],
      clearReaction: true,
      message: "You aren't allowed to use this panel.",
    };
  }

  // Reactions carry direction; components toggle. Normalising here keeps every
  // mode below expressed as "the member is asking for this role" vs "giving it up".
  const picking = source === "component" ? !has : ctx.event === "add";
  const dropping = source === "component" ? has : ctx.event === "remove";

  switch (panel.mode) {
    case "normal":
      if (picking) return { add: [roleId], remove: [], clearReaction: false, message: `Gave you <@&${roleId}>.` };
      if (dropping) return { add: [], remove: [roleId], clearReaction: false, message: `Removed <@&${roleId}>.` };
      return NOTHING();

    case "unique":
      if (picking) {
        return {
          add: [roleId],
          remove: otherPanelRoles,
          clearReaction: false,
          message: `Gave you <@&${roleId}>${
            otherPanelRoles.length ? " and removed your other role from this panel." : "."
          }`,
        };
      }
      if (dropping) return { add: [], remove: [roleId], clearReaction: false, message: `Removed <@&${roleId}>.` };
      return NOTHING();

    case "verify":
      // Add-only, and the reaction is cleared so the panel stays clean.
      if (has) return NOTHING(`You already have <@&${roleId}>.`);
      if (picking) return { add: [roleId], remove: [], clearReaction: true, message: `Gave you <@&${roleId}>.` };
      return { add: [], remove: [], clearReaction: true, message: "" };

    case "drop":
      if (source === "reaction" && ctx.event === "remove") return NOTHING();
      if (!has) return { add: [], remove: [], clearReaction: true, message: `You don't have <@&${roleId}>.` };
      return { add: [], remove: [roleId], clearReaction: true, message: `Removed <@&${roleId}>.` };

    case "reversed":
      // Reacting gives the role up; un-reacting takes it back.
      if (source === "reaction") {
        return ctx.event === "add"
          ? { add: [], remove: [roleId], clearReaction: false, message: "" }
          : { add: [roleId], remove: [], clearReaction: false, message: "" };
      }
      return has
        ? { add: [], remove: [roleId], clearReaction: false, message: `Removed <@&${roleId}>.` }
        : { add: [roleId], remove: [], clearReaction: false, message: `Gave you <@&${roleId}>.` };

    case "binding":
      // verify + unique: one role, permanently.
      if (heldOnPanel > 0) {
        return {
          add: [],
          remove: [],
          clearReaction: true,
          message: has
            ? `You already have <@&${roleId}>, and this panel's choice is permanent.`
            : "You already made your choice on this panel, and it can't be changed.",
        };
      }
      if (picking) return { add: [roleId], remove: [], clearReaction: true, message: `Gave you <@&${roleId}>. This choice is permanent.` };
      return { add: [], remove: [], clearReaction: true, message: "" };

    case "limit":
      if (dropping) return { add: [], remove: [roleId], clearReaction: false, message: `Removed <@&${roleId}>.` };
      if (picking && heldOnPanel >= panel.maxRoles) {
        return {
          add: [],
          remove: [],
          clearReaction: true,
          message: `You can only hold ${panel.maxRoles} role${
            panel.maxRoles === 1 ? "" : "s"
          } from this panel. Give one up first.`,
        };
      }
      if (picking) return { add: [roleId], remove: [], clearReaction: false, message: `Gave you <@&${roleId}>.` };
      return NOTHING();
  }
}
