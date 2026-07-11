import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type GuildMember,
} from "discord.js";
import {
  COLORS,
  CID,
  type TicketConfig,
  type TicketType,
  type Form,
} from "@rukus/shared";
import { ticketConfig, formsConfig } from "../../lib/configCache.js";
import { hasAnyRole } from "../../lib/perms.js";
import { log } from "../../lib/logger.js";
import {
  createTicket,
  getTicketByChannel,
  claimTicket,
  markClosed,
  countOpenForUser,
  allSupportRoleIds,
} from "./service.js";
import {
  ticketOpenedMessage,
  closeConfirmMessage,
  closedControlsMessage,
  resolveTypes,
} from "./ui.js";
import { buildTranscript } from "./transcript.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** Find a ticket type by id, falling back to the first configured type. */
function typeById(config: TicketConfig, typeId: string | undefined): TicketType {
  const types = resolveTypes(config);
  return types.find((t) => t.id === typeId) ?? types[0]!;
}

/** Returns an error string if the user may not open a ticket, else null. */
async function openBlockReason(
  guildId: string,
  userId: string,
  config: TicketConfig,
): Promise<string | null> {
  if (!config.enabled) {
    return "The ticket system isn't enabled on this server yet.";
  }
  if (config.maxOpenPerUser > 0) {
    const open = await countOpenForUser(guildId, userId);
    if (open >= config.maxOpenPerUser) {
      return `You already have ${open} open ticket(s). Please use those first.`;
    }
  }
  return null;
}

/** Build the pre-ticket questions modal for a type with an attached form. */
function buildTicketModal(type: TicketType, form: Form): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${CID.ticketModal}:${type.id}`)
    .setTitle(form.title.slice(0, 45));
  for (const field of form.fields.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label.slice(0, 45))
      .setStyle(
        field.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short,
      )
      .setRequired(field.required);
    if (field.placeholder) input.setPlaceholder(field.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

/** Create the channel, post the welcome (and any form answers), confirm. */
async function createAndAnnounce(
  interaction:
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  config: TicketConfig,
  type: TicketType,
  answers: { label: string; value: string }[] | null,
) {
  if (!interaction.inCachedGuild()) return;
  await interaction.deferReply(ephemeral);

  try {
    const { ticket, channel } = await createTicket({
      guild: interaction.guild,
      opener: interaction.member as GuildMember,
      config,
      type,
    });

    const opened = ticketOpenedMessage({
      config,
      type,
      openerId: interaction.user.id,
      ticketNumber: ticket.number,
    });
    if (config.pingSupportOnOpen) {
      const roleIds =
        type.supportRoleIds.length > 0 ? type.supportRoleIds : config.supportRoleIds;
      if (roleIds.length > 0) {
        opened.content = `${roleIds.map((r) => `<@&${r}>`).join(" ")} ${opened.content}`;
      }
    }
    await channel.send(opened);

    // Post the pre-ticket form answers so staff have context immediately.
    if (answers && answers.length > 0) {
      const answersEmbed = new EmbedBuilder()
        .setColor(COLORS.neutral)
        .setTitle("Submitted answers")
        .addFields(
          answers.map((a) => ({
            name: a.label.slice(0, 256),
            value: (a.value || "*(blank)*").slice(0, 1024),
          })),
        );
      await channel.send({ embeds: [answersEmbed] });
    }

    await interaction.editReply({
      content: `Your **${type.label}** ticket has been created: <#${channel.id}>`,
    });
  } catch (err) {
    log.error("Failed to create ticket:", err);
    await interaction.editReply({
      content:
        "I couldn't create your ticket. This usually means I'm missing the " +
        "**Manage Channels** permission or the configured category is invalid.",
    });
  }
}

/** Shared open flow for both the button and the dropdown. */
async function openTicket(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  typeId: string | undefined,
) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);
  const type = typeById(config, typeId);

  const blocked = await openBlockReason(
    interaction.guildId,
    interaction.user.id,
    config,
  );
  if (blocked) {
    await interaction.reply({ content: blocked, ...ephemeral });
    return;
  }

  // Type has a form attached: collect answers first, then open the ticket
  // from the modal submit. (A modal must be the FIRST response, no defer.)
  if (type.formId) {
    const forms = await formsConfig(interaction.guildId);
    const form = forms.forms.find((f) => f.id === type.formId);
    if (form) {
      await interaction.showModal(buildTicketModal(type, form));
      return;
    }
  }

  await createAndAnnounce(interaction, config, type, null);
}

/** User clicked the "Open a ticket" button (single-type panels). The custom id
 *  may carry a type suffix (`tkt:open:<typeId>`); legacy panels have none. */
export async function handleOpenButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  await openTicket(interaction, parts[2]);
}

/** User picked a ticket type from the panel dropdown. */
export async function handleOpenSelect(
  interaction: StringSelectMenuInteraction,
) {
  await openTicket(interaction, interaction.values[0]);
}

/** User submitted the pre-ticket questions modal (`tkt:modal:<typeId>`). */
export async function handleTicketModal(interaction: ModalSubmitInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);
  const typeId = interaction.customId.split(":")[2];
  const type = typeById(config, typeId);

  // Re-check limits: they could have opened another ticket mid-modal.
  const blocked = await openBlockReason(
    interaction.guildId,
    interaction.user.id,
    config,
  );
  if (blocked) {
    await interaction.reply({ content: blocked, ...ephemeral });
    return;
  }

  // Collect the answers using the attached form's field definitions.
  let answers: { label: string; value: string }[] = [];
  if (type.formId) {
    const forms = await formsConfig(interaction.guildId);
    const form = forms.forms.find((f) => f.id === type.formId);
    if (form) {
      answers = form.fields.map((f) => {
        let value = "";
        try {
          value = interaction.fields.getTextInputValue(f.id);
        } catch {
          /* field may have been edited out of the form since the modal opened */
        }
        return { label: f.label, value };
      });
    }
  }

  await createAndAnnounce(interaction, config, type, answers);
}

/** Staff clicked "Claim" inside a ticket. */
export async function handleClaimButton(interaction: ButtonInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);
  const member = interaction.member as GuildMember;

  if (!hasAnyRole(member, allSupportRoleIds(config))) {
    await interaction.reply({
      content: "Only support staff can claim tickets.",
      ...ephemeral,
    });
    return;
  }

  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) {
    await interaction.reply({ content: "This isn't a ticket channel.", ...ephemeral });
    return;
  }
  if (ticket.claimedBy) {
    await interaction.reply({
      content: `Already claimed by <@${ticket.claimedBy}>.`,
      ...ephemeral,
    });
    return;
  }

  await claimTicket(interaction.channelId, interaction.user.id);
  await interaction.reply({
    embeds: [
      {
        color: COLORS.success,
        description: `🙋 Claimed by <@${interaction.user.id}>.`,
      },
    ],
  });
}

/** Anyone with access clicked "Close" - show a confirmation. */
export async function handleCloseButton(interaction: ButtonInteraction) {
  await interaction.reply({ ...closeConfirmMessage(), ...ephemeral });
}

/**
 * Core close flow, shared by the Confirm-close button and /ticket close:
 * transcript, mark closed, revoke the opener, post closed controls.
 * Returns the note to show, or an error string when it isn't closable.
 */
export async function closeTicketFlow(
  channel: TextChannel,
  config: TicketConfig,
  closedById: string,
): Promise<{ ok: boolean; message: string }> {
  const ticket = await getTicketByChannel(channel.id);
  if (!ticket) return { ok: false, message: "This isn't a ticket channel." };
  if (ticket.status === "CLOSED") {
    return { ok: false, message: "This ticket is already closed." };
  }

  // Per-type transcript channel wins when the type still exists.
  const ticketType = config.types.find((t) => t.id === ticket.typeId);
  const transcriptChannelId =
    ticketType?.transcriptChannelId ?? config.transcriptChannelId;

  // Build + post transcript to the configured channel.
  let transcriptNote = "";
  try {
    const { html, count } = await buildTranscript(channel);
    const file = {
      attachment: html,
      name: `transcript-ticket-${String(ticket.number).padStart(4, "0")}.html`,
    };
    if (transcriptChannelId) {
      const tChannel = await channel.guild.channels
        .fetch(transcriptChannelId)
        .catch(() => null);
      if (tChannel && tChannel.type === ChannelType.GuildText) {
        await (tChannel as TextChannel).send({
          embeds: [
            {
              color: COLORS.neutral,
              title: `Ticket #${String(ticket.number).padStart(4, "0")} closed`,
              description: `Opened by <@${ticket.openerId}> • ${count} messages • closed by <@${closedById}>`,
            },
          ],
          files: [file],
        });
        transcriptNote = ` Transcript posted to <#${transcriptChannelId}>.`;
      }
    }
  } catch (err) {
    log.error("Transcript build failed:", err);
    transcriptNote = " (Transcript could not be generated.)";
  }

  await markClosed(channel.id);

  // Revoke the opener's access; keep support roles able to see it.
  try {
    await channel.permissionOverwrites.edit(ticket.openerId, {
      ViewChannel: false,
    });
  } catch {
    /* opener may have left the guild */
  }

  await channel.send(closedControlsMessage(closedById));
  return { ok: true, message: `🔒 Ticket closed.${transcriptNote}` };
}

/** Close confirmed via the button. */
export async function handleCloseConfirm(interaction: ButtonInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);
  await interaction.deferReply();
  const result = await closeTicketFlow(
    interaction.channel as TextChannel,
    config,
    interaction.user.id,
  );
  await interaction.editReply({ content: result.message });
}

/** Staff clicked "Reopen" on a closed ticket. */
export async function handleReopen(interaction: ButtonInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);
  const member = interaction.member as GuildMember;
  if (!hasAnyRole(member, allSupportRoleIds(config))) {
    await interaction.reply({ content: "Only staff can reopen tickets.", ...ephemeral });
    return;
  }
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) {
    await interaction.reply({ content: "This isn't a ticket channel.", ...ephemeral });
    return;
  }

  const { prisma } = await import("@rukus/db");
  await prisma.ticket.update({
    where: { channelId: interaction.channelId },
    data: { status: "OPEN", closedAt: null },
  });

  const channel = interaction.channel as TextChannel;
  try {
    await channel.permissionOverwrites.edit(ticket.openerId, { ViewChannel: true });
  } catch {
    /* opener may have left */
  }
  await interaction.reply({
    embeds: [{ color: COLORS.success, description: "🔓 Ticket reopened." }],
  });
}

/** Staff clicked "Delete" on a closed ticket - remove the channel. */
export async function handleDelete(interaction: ButtonInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);
  const member = interaction.member as GuildMember;
  if (
    !hasAnyRole(member, allSupportRoleIds(config)) &&
    !member.permissions.has(PermissionFlagsBits.ManageChannels)
  ) {
    await interaction.reply({ content: "Only staff can delete tickets.", ...ephemeral });
    return;
  }
  await interaction.reply({ content: "Deleting this channel in 5 seconds…" });
  const channel = interaction.channel as TextChannel;
  setTimeout(() => {
    channel.delete("Ticket deleted by staff").catch((e) => log.error("Delete failed:", e));
  }, 5000);
}
