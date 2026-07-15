import { CID, COLORS } from "./constants.js";
import type { TicketConfig, TicketType, FormsConfig, Form } from "./schemas.js";

/**
 * Panel payload builders, shared by the bot and the dashboard.
 *
 * These return plain Discord API JSON (embeds + components), NOT discord.js
 * builders, so the dashboard can post/edit panels over REST with the bot token
 * and the bot can pass the same objects straight to channel.send(). One source
 * of truth means "publish from the website" and /ticket panel are pixel
 * identical.
 */

export interface PanelPayload {
  embeds: object[];
  components: object[];
}

/** Parse "#rrggbb" into the integer Discord wants; fall back to blurple. */
export function hexToInt(hex: string | undefined): number {
  if (!hex) return COLORS.primary;
  const n = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(n) ? COLORS.primary : n;
}

/**
 * Resolve the guild's ticket types. When none are configured we synthesize a
 * single default type, so callers never special-case "no types".
 */
export function resolveTypes(config: TicketConfig): TicketType[] {
  if (config.types.length > 0) return config.types;
  return [
    {
      id: "default",
      label: "Support",
      description: "",
      emoji: "🎫",
      nameTemplate: "ticket-{count}",
      categoryId: undefined,
      welcomeMessage: undefined,
      formId: undefined,
      transcriptChannelId: undefined,
      supportRoleIds: [],
      ratingsEnabled: null,
    },
  ];
}

/** Emoji object for the API, or undefined when the string can't be one. */
function apiEmoji(emoji: string | undefined): { name: string } | undefined {
  const e = emoji?.trim();
  if (!e) return undefined;
  // A real unicode emoji is non-ASCII; plain text here would 400 the request.
  if (/^[\x00-\x7F]+$/.test(e)) return undefined;
  return { name: e };
}

/** The ticket panel: one type = button, several = select menu. */
export function buildTicketPanelPayload(config: TicketConfig): PanelPayload {
  const embed = {
    title: config.panel.title,
    description: config.panel.description,
    color: hexToInt(config.panel.color),
  };

  const types = resolveTypes(config);

  if (types.length === 1) {
    const only = types[0]!;
    return {
      embeds: [embed],
      components: [
        {
          type: 1, // action row
          components: [
            {
              type: 2, // button
              style: 1, // primary
              label: config.panel.buttonLabel.slice(0, 80),
              custom_id: `${CID.ticketOpen}:${only.id}`,
              emoji: apiEmoji(only.emoji),
            },
          ],
        },
      ],
    };
  }

  return {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 3, // string select
            custom_id: CID.ticketOpen,
            placeholder: (config.panel.buttonLabel || "Make a selection").slice(0, 150),
            options: types.slice(0, 25).map((t) => ({
              label: t.label.slice(0, 100),
              value: t.id,
              description: t.description ? t.description.slice(0, 100) : undefined,
              emoji: apiEmoji(t.emoji),
            })),
          },
        ],
      },
    ],
  };
}

/**
 * The forms panel: embed + one button per PANEL form. Forms with showOnPanel
 * off (pre-ticket questionnaires attached to ticket types) are excluded.
 */
export function panelForms(config: FormsConfig) {
  // Forms with their own panel are deliberately excluded from the shared one:
  // otherwise a form would get two buttons in two places for the same thing.
  return config.forms.filter((f) => f.showOnPanel && !f.ownPanel);
}

/**
 * Build the panel for ONE form: its own embed, its own single button.
 *
 * The shared panel crams every form onto one embed, which stops working the
 * moment two forms need different wording or different channels. A form with
 * ownPanel gets this instead.
 */
export function buildFormPanelPayload(form: Form): PanelPayload {
  const embed = {
    title: form.panelTitle.trim() || form.name,
    description: form.panelDescription.trim() || form.description || "",
    color: hexToInt(form.panelColor),
  };

  return {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: (form.buttonLabel || "Apply").slice(0, 80),
            custom_id: `${CID.formOpen}:${form.id}`,
            emoji: { name: "📝" },
          },
        ],
      },
    ],
  };
}

export function buildFormsPanelPayload(config: FormsConfig): PanelPayload {
  const forms = panelForms(config);
  const description =
    config.panel.description.trim() ||
    forms
      .map((f) => `• **${f.name}**${f.description ? `: ${f.description}` : ""}`)
      .join("\n") ||
    "No forms configured yet.";

  const embed = {
    title: config.panel.title,
    description,
    color: hexToInt(config.panel.color),
  };

  // Max 5 buttons per row, max 5 rows.
  const rows: object[] = [];
  for (let i = 0; i < forms.length && rows.length < 5; i += 5) {
    rows.push({
      type: 1,
      components: forms.slice(i, i + 5).map((f) => ({
        type: 2,
        style: 1,
        label: (f.buttonLabel || "Apply").slice(0, 80),
        custom_id: `${CID.formOpen}:${f.id}`,
        emoji: { name: "📝" },
      })),
    });
  }

  return { embeds: [embed], components: rows };
}
