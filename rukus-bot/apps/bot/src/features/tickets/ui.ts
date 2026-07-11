import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageCreateOptions,
} from "discord.js";
import {
  COLORS,
  CID,
  buildTicketPanelPayload,
  resolveTypes,
  hexToInt,
  type TicketConfig,
  type TicketType,
} from "@rukus/shared";

// Re-exported for the rest of the ticket feature.
export { resolveTypes, hexToInt };

/**
 * The public panel that lives in a support channel. Built by the SHARED
 * payload builder so /ticket panel and the dashboard's "Post to Discord"
 * produce the identical message.
 */
export function panelMessage(config: TicketConfig): MessageCreateOptions {
  return buildTicketPanelPayload(config) as MessageCreateOptions;
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
