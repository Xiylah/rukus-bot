import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel,
  type ButtonInteraction,
  type GuildMember,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import { ticketConfig } from "../../lib/configCache.js";
import { hasAnyRole } from "../../lib/perms.js";
import { log } from "../../lib/logger.js";
import {
  createTicket,
  getTicketByChannel,
  claimTicket,
  markClosed,
  countOpenForUser,
} from "./service.js";
import {
  ticketOpenedMessage,
  closeConfirmMessage,
  closedControlsMessage,
} from "./ui.js";
import { buildTranscript } from "./transcript.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** User clicked "Open a ticket" on a panel. */
export async function handleOpenButton(interaction: ButtonInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);

  if (!config.enabled) {
    await interaction.reply({
      content: "The ticket system isn't enabled on this server yet.",
      ...ephemeral,
    });
    return;
  }

  // Enforce per-user open limit.
  if (config.maxOpenPerUser > 0) {
    const open = await countOpenForUser(interaction.guildId, interaction.user.id);
    if (open >= config.maxOpenPerUser) {
      await interaction.reply({
        content: `You already have ${open} open ticket(s). Please use those first.`,
        ...ephemeral,
      });
      return;
    }
  }

  await interaction.deferReply(ephemeral);

  try {
    const { ticket, channel } = await createTicket({
      guild: interaction.guild,
      opener: interaction.member as GuildMember,
      config,
    });

    await channel.send(
      ticketOpenedMessage({
        config,
        openerId: interaction.user.id,
        ticketNumber: ticket.number,
      }),
    );

    await interaction.editReply({
      content: `Your ticket has been created: <#${channel.id}>`,
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

/** Staff clicked "Claim" inside a ticket. */
export async function handleClaimButton(interaction: ButtonInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);
  const member = interaction.member as GuildMember;

  if (!hasAnyRole(member, config.supportRoleIds)) {
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

/** Anyone with access clicked "Close" — show a confirmation. */
export async function handleCloseButton(interaction: ButtonInteraction) {
  await interaction.reply({ ...closeConfirmMessage(), ...ephemeral });
}

/** Close confirmed — post transcript, lock the channel, show closed controls. */
export async function handleCloseConfirm(interaction: ButtonInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) {
    await interaction.reply({ content: "This isn't a ticket channel.", ...ephemeral });
    return;
  }
  if (ticket.status === "CLOSED") {
    await interaction.reply({ content: "This ticket is already closed.", ...ephemeral });
    return;
  }

  await interaction.deferReply();
  const channel = interaction.channel as TextChannel;

  // Build + post transcript to the configured channel (and/or here).
  let transcriptNote = "";
  try {
    const { html, count } = await buildTranscript(channel);
    const file = {
      attachment: html,
      name: `transcript-ticket-${String(ticket.number).padStart(4, "0")}.html`,
    };
    if (config.transcriptChannelId) {
      const tChannel = await interaction.guild.channels
        .fetch(config.transcriptChannelId)
        .catch(() => null);
      if (tChannel && tChannel.type === ChannelType.GuildText) {
        await (tChannel as TextChannel).send({
          embeds: [
            {
              color: COLORS.neutral,
              title: `Ticket #${String(ticket.number).padStart(4, "0")} closed`,
              description: `Opened by <@${ticket.openerId}> • ${count} messages • closed by <@${interaction.user.id}>`,
            },
          ],
          files: [file],
        });
        transcriptNote = ` Transcript posted to <#${config.transcriptChannelId}>.`;
      }
    }
  } catch (err) {
    log.error("Transcript build failed:", err);
    transcriptNote = " (Transcript could not be generated.)";
  }

  await markClosed(interaction.channelId);

  // Revoke the opener's access; keep support roles able to see it.
  try {
    await channel.permissionOverwrites.edit(ticket.openerId, {
      ViewChannel: false,
    });
  } catch {
    /* opener may have left the guild */
  }

  await interaction.editReply({
    content: `🔒 Ticket closed.${transcriptNote}`,
  });
  await channel.send(closedControlsMessage(interaction.user.id));
}

/** Staff clicked "Reopen" on a closed ticket. */
export async function handleReopen(interaction: ButtonInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);
  const member = interaction.member as GuildMember;
  if (!hasAnyRole(member, config.supportRoleIds)) {
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

/** Staff clicked "Delete" on a closed ticket — remove the channel. */
export async function handleDelete(interaction: ButtonInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await ticketConfig(interaction.guildId);
  const member = interaction.member as GuildMember;
  if (
    !hasAnyRole(member, config.supportRoleIds) &&
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
