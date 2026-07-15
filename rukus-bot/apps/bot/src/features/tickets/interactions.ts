import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
import { resolvedMention } from "../../lib/mentions.js";
import { log } from "../../lib/logger.js";
import {
  createTicket,
  getTicketByChannel,
  claimTicket,
  markClosed,
  countOpenForUser,
  allSupportRoleIds,
  missingTicketPerms,
} from "./service.js";
import {
  ticketOpenedMessage,
  closeConfirmMessage,
  closedControlsMessage,
  resolveTypes,
  hexToInt,
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
    if (field.minLength !== undefined) input.setMinLength(field.minLength);
    if (field.maxLength !== undefined) input.setMaxLength(field.maxLength);
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

  // Tell the admin EXACTLY which permission is missing instead of guessing.
  const missing = missingTicketPerms(interaction.guild);
  if (missing.length > 0) {
    await interaction.editReply({
      content:
        "I can't create ticket channels because my role is missing these " +
        `server-wide permissions: **${missing.join(", ")}**.
` +
        "An admin can fix this in Server Settings > Roles > my role.",
    });
    return;
  }

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

  // Build the transcript, host it behind an unguessable dashboard URL, and
  // post a Ticket-Tool-style summary (owner, panel, per-user message counts,
  // attached HTML, Direct Link button) to the transcript channel.
  let transcriptNote = "";
  let transcript: { url?: string; token?: string; html?: string } | undefined;
  try {
    // Name it after the ticket, not the live channel: "closed-0020" reads the
    // same whether or not the channel was ever renamed.
    const ticketName = `closed-${String(ticket.number).padStart(4, "0")}`;
    const { html, count, participants } = await buildTranscript(channel, {
      title: ticketName,
    });

    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(24).toString("hex");
    const base = process.env.DASHBOARD_URL?.replace(/\/+$/, "");
    const url = base ? `${base}/transcript/${token}` : undefined;
    transcript = { url, token, html: html.toString("utf-8") };

    if (!transcriptChannelId) {
      transcriptNote = url
        ? ` Transcript: ${url}`
        : " (No transcript channel is configured; set one on the dashboard.)";
    } else {
      const tChannel = await channel.guild.channels
        .fetch(transcriptChannelId)
        .catch(() => null);
      if (!tChannel || !tChannel.isSendable()) {
        transcriptNote =
          ` I couldn't post the transcript to <#${transcriptChannelId}>` +
          " (channel missing or I lack permission there)." +
          (url ? ` Transcript: ${url}` : "");
      } else {
        const userList = participants
          .map((p) => `${p.count} - <@${p.id}> - ${p.tag}`)
          .join("\n")
          .slice(0, 1024);
        // Resolve the owner and closer to "<@id> (name)" so the summary reads
        // correctly on mobile even when that client has never cached them.
        const [ownerMention, closerMention] = await Promise.all([
          resolvedMention(channel.guild, ticket.openerId),
          resolvedMention(channel.guild, closedById),
        ]);
        const summary = {
          embeds: [
            {
              color: hexToInt(config.panel.color),
              fields: [
                { name: "Ticket Owner", value: ownerMention, inline: true },
                { name: "Ticket Name", value: ticketName, inline: true },
                { name: "Panel", value: ticket.subject ?? "Support", inline: true },
                { name: "Closed By", value: closerMention, inline: true },
                { name: "Messages", value: String(count), inline: true },
                { name: "Users in transcript", value: userList || "none" },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
          // No HTML attachment: Discord inlines a preview of the whole file,
          // which dumps the stylesheet into the channel. The Direct Link below
          // serves the same transcript from /transcript/<token>.
          components: url
            ? [
                {
                  type: 1,
                  components: [
                    { type: 2, style: 5, label: "Direct Link", url },
                  ],
                },
              ]
            : [],
        };
        await (tChannel as TextChannel).send(summary as never);
        transcriptNote = ` Transcript posted to <#${transcriptChannelId}>.`;
      }
    }
  } catch (err) {
    log.error("Transcript build failed:", err);
    transcriptNote = " (Transcript could not be generated.)";
  }

  await markClosed(channel.id, transcript);

  // Revoke the opener's access; keep support roles able to see it.
  try {
    await channel.permissionOverwrites.edit(ticket.openerId, {
      ViewChannel: false,
    });
  } catch {
    /* opener may have left the guild */
  }

  await channel.send(closedControlsMessage(closedById));

  // Ask the opener how it went (5-star DM). Never blocks the close.
  try {
    if (config.ratingsEnabled && !ticket.rating) {
      const opener = await channel.client.users.fetch(ticket.openerId);
      const stars = new ActionRowBuilder<ButtonBuilder>().addComponents(
        [1, 2, 3, 4, 5].map((n) =>
          new ButtonBuilder()
            .setCustomId(`${CID.ticketRate}:${ticket.id}:${n}`)
            .setLabel("⭐".repeat(n))
            .setStyle(ButtonStyle.Secondary),
        ),
      );
      await opener.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle("How was your support?")
            .setDescription(
              `Your **${ticket.subject ?? "Support"}** ticket in ` +
                `**${channel.guild.name}** was just closed. ` +
                `Mind rating the help you received?`,
            ),
        ],
        components: [stars],
      });
    }
  } catch {
    /* DMs closed is normal */
  }

  return { ok: true, message: `🔒 Ticket closed.${transcriptNote}` };
}

/**
 * Opener clicked a star in the rating DM. Runs OUTSIDE a guild, so it must
 * not assume guild context; everything it needs comes from the ticket row.
 */
export async function handleRateButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ticketId = parts[2];
  const stars = Number(parts[3]);
  if (!ticketId || !Number.isInteger(stars) || stars < 1 || stars > 5) return;

  const { prisma } = await import("@rukus/db");
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    await interaction.update({ embeds: [], components: [], content: "This ticket no longer exists." });
    return;
  }
  if (ticket.rating) {
    await interaction.reply({
      content: `You already rated this ticket ${"⭐".repeat(ticket.rating)}.`,
      ...ephemeral,
    });
    return;
  }

  await prisma.ticket.update({ where: { id: ticketId }, data: { rating: stars } });

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle("Thanks for the feedback!")
        .setDescription(`You rated your support ${"⭐".repeat(stars)} (${stars}/5).`),
    ],
    components: [],
  });

  // Surface the rating to staff in the ticket's transcript channel.
  try {
    const guild = interaction.client.guilds.cache.get(ticket.guildId);
    if (!guild) return;
    const config = await ticketConfig(ticket.guildId);
    const type = config.types.find((t) => t.id === ticket.typeId);
    const logChannelId = type?.transcriptChannelId ?? config.transcriptChannelId;
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel?.isSendable()) return;
    const [openedBy, handledBy] = await Promise.all([
      resolvedMention(guild, ticket.openerId),
      ticket.claimedBy
        ? resolvedMention(guild, ticket.claimedBy)
        : Promise.resolve(""),
    ]);
    await logChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(stars >= 4 ? COLORS.success : stars >= 3 ? COLORS.warning : COLORS.danger)
          .setDescription(
            `${"⭐".repeat(stars)} (${stars}/5) rating for ticket ` +
              `**#${String(ticket.number).padStart(4, "0")}** (${ticket.subject ?? "Support"})` +
              `\nOpened by ${openedBy}` +
              (handledBy ? ` • handled by ${handledBy}` : ""),
          ),
      ],
    });
  } catch {
    /* log failure is non-fatal */
  }
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
