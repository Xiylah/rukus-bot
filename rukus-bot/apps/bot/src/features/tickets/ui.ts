import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { COLORS, CID, type TicketConfig, type TicketType } from "@rukus/shared";

/**
 * Resolve the guild's ticket types. When none are configured we synthesize a
 * single default type from the guild-level settings, so the rest of the code
 * never has to special-case "no types".
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
    },
  ];
}

/**
 * The public panel that lives in a support channel.
 * One ticket type → a button (classic). Multiple → a Ticket-Tool-style
 * dropdown where each option is a type.
 */
export function panelMessage(config: TicketConfig) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(config.panel.title)
    .setDescription(config.panel.description);

  const types = resolveTypes(config);

  if (types.length === 1) {
    const only = types[0]!;
    const button = new ButtonBuilder()
      .setCustomId(`${CID.ticketOpen}:${only.id}`)
      .setLabel(config.panel.buttonLabel)
      .setStyle(ButtonStyle.Primary);
    trySetEmoji(button, only.emoji);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    return { embeds: [embed], components: [row] };
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(CID.ticketOpen)
    .setPlaceholder(config.panel.buttonLabel || "Make a selection")
    .addOptions(
      types.slice(0, 25).map((t) => {
        const opt = new StringSelectMenuOptionBuilder()
          .setValue(t.id)
          .setLabel(t.label.slice(0, 100));
        if (t.description) opt.setDescription(t.description.slice(0, 100));
        trySetEmoji(opt, t.emoji);
        return opt;
      }),
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

/** setEmoji throws on strings Discord can't parse; a bad emoji in config must
 *  not prevent the whole panel from posting. */
function trySetEmoji(
  target: { setEmoji: (e: string) => unknown },
  emoji: string | undefined,
) {
  if (!emoji?.trim()) return;
  try {
    target.setEmoji(emoji.trim());
  } catch {
    /* skip invalid emoji */
  }
}

/** The message posted inside a freshly opened ticket channel. */
export function ticketOpenedMessage(params: {
  config: TicketConfig;
  type: TicketType;
  openerId: string;
  ticketNumber: number;
}) {
  const { config, type, openerId, ticketNumber } = params;
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${type.emoji} ${type.label} #${String(ticketNumber).padStart(4, "0")}`)
    .setDescription(type.welcomeMessage || config.welcomeMessage)
    .addFields({ name: "Ticket type", value: type.label, inline: true })
    .setFooter({ text: "Use the buttons below to claim or close this ticket." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CID.ticketClaim)
      .setLabel("Claim")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🙋"),
    new ButtonBuilder()
      .setCustomId(CID.ticketClose)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒"),
  );

  return { content: `<@${openerId}>`, embeds: [embed], components: [row] };
}

/** Confirmation prompt shown before actually closing. */
export function closeConfirmMessage() {
  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setDescription("Are you sure you want to close this ticket?");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CID.ticketCloseConfirm)
      .setLabel("Confirm close")
      .setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row] };
}

/** Controls shown after a ticket is closed (staff only can see the channel). */
export function closedControlsMessage(closedById: string) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.neutral)
    .setDescription(`🔒 Ticket closed by <@${closedById}>.`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CID.ticketReopen)
      .setLabel("Reopen")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔓"),
    new ButtonBuilder()
      .setCustomId(CID.ticketDelete)
      .setLabel("Delete")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️"),
  );
  return { embeds: [embed], components: [row] };
}
