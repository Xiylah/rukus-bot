import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { COLORS, CID, type TicketConfig } from "@rukus/shared";

/** The public panel embed + open button that lives in a support channel. */
export function panelMessage(config: TicketConfig) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(config.panel.title)
    .setDescription(config.panel.description);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CID.ticketOpen)
      .setLabel(config.panel.buttonLabel)
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎫"),
  );

  return { embeds: [embed], components: [row] };
}

/** The message posted inside a freshly opened ticket channel. */
export function ticketOpenedMessage(params: {
  config: TicketConfig;
  openerId: string;
  ticketNumber: number;
}) {
  const { config, openerId, ticketNumber } = params;
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`Ticket #${String(ticketNumber).padStart(4, "0")}`)
    .setDescription(config.welcomeMessage)
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
