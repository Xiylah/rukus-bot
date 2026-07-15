import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
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

/** Staff approved a submission. */
export async function handleApprove(interaction: ButtonInteraction) {
  await resolveAndUpdate(interaction, "APPROVED");
}

/** Staff denied a submission. */
export async function handleDeny(interaction: ButtonInteraction) {
  await resolveAndUpdate(interaction, "DENIED");
}

async function resolveAndUpdate(
  interaction: ButtonInteraction,
  status: "APPROVED" | "DENIED",
) {
  if (!interaction.inCachedGuild()) return;
  const submissionId = idFromCustomId(interaction.customId);
  const submission = await getSubmission(submissionId);
  if (!submission) {
    await interaction.reply({ content: "Submission not found.", ...ephemeral });
    return;
  }
  if (submission.status !== "PENDING") {
    await interaction.reply({
      content: `Already ${submission.status.toLowerCase()}.`,
      ...ephemeral,
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

  // Update the review card in place: recolor, strip buttons, add verdict.
  const original = interaction.message.embeds[0];
  const updated = EmbedBuilder.from(original ?? {})
    .setColor(status === "APPROVED" ? COLORS.success : COLORS.danger)
    .addFields({
      name: status === "APPROVED" ? "✅ Approved" : "❌ Denied",
      value: `by <@${interaction.user.id}>`,
    });

  await interaction.update({ embeds: [updated], components: [] });

  // DM the applicant the result (best-effort).
  const user = await interaction.client.users.fetch(submission.userId).catch(() => null);
  await user
    ?.send(
      status === "APPROVED"
        ? `Your **${submission.formName}** submission was approved. 🎉`
        : `Your **${submission.formName}** submission was denied.`,
    )
    .catch(() => {});
}
