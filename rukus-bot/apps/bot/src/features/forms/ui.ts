import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageCreateOptions,
} from "discord.js";
import {
  COLORS,
  CID,
  buildFormsPanelPayload,
  type Form,
  type FormsConfig,
} from "@rukus/shared";

/**
 * Custom-id format for forms: we append the form id so a single handler can
 * serve any form.  `frm:open:<formId>` and `frm:modal:<formId>`.
 * Discord caps custom_id at 100 chars; form ids are short cuid/slug values.
 */
export const formOpenId = (formId: string) => `${CID.formOpen}:${formId}`;
export const formModalId = (formId: string) => `${CID.formModal}:${formId}`;
export const formApproveId = (submissionId: string) =>
  `${CID.formApprove}:${submissionId}`;
export const formDenyId = (submissionId: string) => `${CID.formDeny}:${submissionId}`;

/** Extract the trailing id from a namespaced custom-id. */
export function idFromCustomId(customId: string): string {
  const parts = customId.split(":");
  return parts[parts.length - 1] ?? "";
}

/**
 * The public panel: embed + a button per form. Built by the SHARED payload
 * builder so /form panel and the dashboard's "Post to Discord" are identical.
 */
export function formPanelMessage(config: FormsConfig): MessageCreateOptions {
  return buildFormsPanelPayload(config) as MessageCreateOptions;
}

/** Build the modal for a given form definition. */
export function buildFormModal(form: Form): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(formModalId(form.id))
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
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );
  }

  return modal;
}

/** The review card posted to staff, with approve/deny buttons. */
export function reviewMessage(params: {
  formName: string;
  userId: string;
  submissionId: string;
  answers: { label: string; value: string }[];
}) {
  const { formName, userId, submissionId, answers } = params;
  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle(`New submission - ${formName}`)
    .setDescription(`From <@${userId}>`)
    .addFields(
      answers.map((a) => ({
        name: a.label.slice(0, 256),
        value: (a.value || "_(blank)_").slice(0, 1024),
      })),
    )
    .setFooter({ text: `Submission ${submissionId}` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(formApproveId(submissionId))
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(formDenyId(submissionId))
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
  );

  return { embeds: [embed], components: [row] };
}
