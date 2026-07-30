import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { COLORS, CID } from "@rukus/shared";
import { formsConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import {
  findForm,
  createSubmission,
  getSubmission,
  attachReviewMessage,
  resolveSubmission,
} from "./service.js";
import {
  buildFormModal,
  reviewMessage,
  idFromCustomId,
} from "./ui.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** User clicked a form's "Apply" button → show the modal. */
export async function handleOpenButton(interaction: ButtonInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await formsConfig(interaction.guildId);
  if (!config.enabled) {
    await interaction.reply({ content: "Forms aren't enabled here.", ...ephemeral });
    return;
  }
  const formId = idFromCustomId(interaction.customId);
  const form = findForm(config, formId);
  if (!form) {
    await interaction.reply({
      content: "That form no longer exists. Ask an admin to repost the panel.",
      ...ephemeral,
    });
    return;
  }
  await interaction.showModal(buildFormModal(form));
}

/** User submitted the modal → persist + post to the review channel. */
export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  if (!interaction.inCachedGuild()) return;
  const config = await formsConfig(interaction.guildId);
  const formId = idFromCustomId(interaction.customId);
  const form = findForm(config, formId);
  if (!form) {
    await interaction.reply({ content: "That form no longer exists.", ...ephemeral });
    return;
  }

  // Collect answers in field order, using labels for display.
  const answers = form.fields.map((f) => ({
    label: f.label,
    value: interaction.fields.getTextInputValue(f.id) ?? "",
  }));

  await interaction.deferReply(ephemeral);

  const submission = await createSubmission({
    guildId: interaction.guildId,
    formId: form.id,
    formName: form.name,
    userId: interaction.user.id,
    answers,
  });

  // Post to the review channel if configured.
  if (form.reviewChannelId) {
    const channel = await interaction.guild.channels
      .fetch(form.reviewChannelId)
      .catch(() => null);
    if (channel && channel.type === ChannelType.GuildText) {
      const msg = await (channel as TextChannel).send(
        reviewMessage({
          formName: form.name,
          userId: interaction.user.id,
          // The applicant's @handle next to the mention, so the "From" line
          // stays readable on mobile even when the client cannot resolve the
          // mention. The handle matches what resolvedMention shows everywhere.
          userName: interaction.user.username,
          submissionId: submission.id,
          answers,
        }),
      );
      await attachReviewMessage(submission.id, msg.id);
    } else {
      log.warn(`Form ${form.id} review channel ${form.reviewChannelId} unusable.`);
    }
  }

  await interaction.editReply({
    content: "✅ Your submission has been received. Staff will review it soon.",
  });
}

/**
 * Staff clicked Approve/Deny on the review card.
 *
 * These no longer resolve the submission. They open a private "are you sure?"
 * prompt, and only its button resolves. The review buttons sit right next to
 * each other on a card a moderator scrolls past dozens of times, so a stray
 * click used to approve or deny an application outright, DM the applicant and
 * grant a role, with no undo. The confirm step makes it a deliberate two-click
 * action, the same pattern ticket-close and server-lockdown already use.
 */
export async function handleApprove(interaction: ButtonInteraction) {
  await promptConfirm(interaction, "APPROVED");
}

export async function handleDeny(interaction: ButtonInteraction) {
  await promptConfirm(interaction, "DENIED");
}

/** Confirm button clicked in the ephemeral prompt → actually resolve. */
export async function handleApproveConfirm(interaction: ButtonInteraction) {
  await resolveAndUpdate(interaction, "APPROVED");
}

export async function handleDenyConfirm(interaction: ButtonInteraction) {
  await resolveAndUpdate(interaction, "DENIED");
}

async function promptConfirm(
  interaction: ButtonInteraction,
  status: "APPROVED" | "DENIED",
) {
  if (!interaction.inCachedGuild()) return;
  const submissionId = idFromCustomId(interaction.customId);

  // Check state up front so we do not prompt to confirm something already
  // decided (e.g. another mod resolved it a second ago).
  const submission = await getSubmission(submissionId);
  if (!submission) {
    await interaction.reply({ content: "Submission not found.", ...ephemeral });
    return;
  }
  if (submission.status !== "PENDING") {
    await interaction.reply({
      content: `Already ${submission.status.toLowerCase()} — nothing to confirm.`,
      ...ephemeral,
    });
    return;
  }

  const approving = status === "APPROVED";
  const confirmCid =
    `${approving ? CID.formApproveConfirm : CID.formDenyConfirm}:${submissionId}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmCid)
      .setLabel(approving ? "Yes, approve" : "Yes, deny")
      .setStyle(approving ? ButtonStyle.Success : ButtonStyle.Danger)
      .setEmoji(approving ? "✅" : "❌"),
  );

  await interaction.reply({
    content:
      `${approving ? "Approve" : "Deny"} **${submission.formName}** from ` +
      `<@${submission.userId}>?` +
      (approving
        ? "\nThis grants any approval role and DMs the applicant."
        : "\nThis DMs the applicant that they were denied."),
    components: [row],
    ...ephemeral,
  });
}

async function resolveAndUpdate(
  interaction: ButtonInteraction,
  status: "APPROVED" | "DENIED",
) {
  if (!interaction.inCachedGuild()) return;
  const submissionId = idFromCustomId(interaction.customId);
  const submission = await getSubmission(submissionId);
  if (!submission) {
    await interaction.update({
      content: "Submission not found.",
      components: [],
    });
    return;
  }
  if (submission.status !== "PENDING") {
    // Someone resolved it between the prompt and the confirm click. Swallow it
    // rather than double-resolving: the first verdict stands.
    await interaction.update({
      content: `Already ${submission.status.toLowerCase()} by someone else.`,
      components: [],
    });
    return;
  }

  await resolveSubmission({
    id: submissionId,
    status,
    reviewedBy: interaction.user.id,
  });

  // Optionally grant a role on approval.
  if (status === "APPROVED") {
    const config = await formsConfig(interaction.guildId);
    const form = config.forms.find((f) => f.id === submission.formId);
    if (form?.approveRoleId) {
      const member = await interaction.guild.members
        .fetch(submission.userId)
        .catch(() => null);
      await member?.roles
        .add(form.approveRoleId, `Form "${form.name}" approved`)
        .catch((e) => log.error("Role grant failed:", e));
    }
  }

  // Update the review CARD in place: recolor, strip its buttons, add the
  // verdict. The confirm click came from the ephemeral prompt, not the card, so
  // edit the card by its stored id rather than interaction.message (which is
  // now the prompt). Both live in the same channel, so interaction.channel is
  // the review channel.
  const reviewMessage =
    submission.reviewMessageId && interaction.channel?.isTextBased()
      ? await interaction.channel.messages
          .fetch(submission.reviewMessageId)
          .catch(() => null)
      : null;

  if (reviewMessage) {
    const original = reviewMessage.embeds[0];
    const updated = EmbedBuilder.from(original ?? {})
      .setColor(status === "APPROVED" ? COLORS.success : COLORS.danger)
      .addFields({
        name: status === "APPROVED" ? "✅ Approved" : "❌ Denied",
        value: `by <@${interaction.user.id}>`,
      });
    await reviewMessage.edit({ embeds: [updated], components: [] }).catch(() => {});
  }

  // Replace the ephemeral prompt with the outcome, clearing its confirm button.
  await interaction.update({
    content:
      status === "APPROVED"
        ? `✅ Approved **${submission.formName}** from <@${submission.userId}>.`
        : `❌ Denied **${submission.formName}** from <@${submission.userId}>.`,
    components: [],
  });

  // DM the applicant the result, unless the server turned result DMs off.
  const cfg = await formsConfig(interaction.guildId);
  if (cfg.dmResult) {
    const user = await interaction.client.users
      .fetch(submission.userId)
      .catch(() => null);
    await user
      ?.send(
        status === "APPROVED"
          ? `Your **${submission.formName}** submission was approved. 🎉`
          : `Your **${submission.formName}** submission was denied.`,
      )
      .catch(() => {});
  }
}
