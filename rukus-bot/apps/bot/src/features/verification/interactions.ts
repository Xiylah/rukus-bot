import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { verificationConfig } from "../../lib/configCache.js";
import { VERIFY_CID } from "./ids.js";
import {
  checkCaptcha,
  checkRoleGrantable,
  issueCaptcha,
  verifyMember,
} from "./service.js";

/**
 * The Verify button and the captcha answer modal.
 *
 * "button" mode grants immediately on click. "captcha" mode shows a short code
 * and opens a modal asking the member to type it back, then grants on a correct
 * answer. No image dependency: the code is generated in service.ts and shown in
 * the modal's own label, so the member never leaves Discord.
 */

const ephemeral = { flags: MessageFlags.Ephemeral as const };

export async function handleVerifyButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const config = await verificationConfig(interaction.guildId);

  if (!config.enabled) {
    await interaction.reply({
      content: "Verification isn't turned on in this server.",
      ...ephemeral,
    });
    return;
  }

  // Fail fast with a clear reason if the bot can't grant the role, rather than
  // making the member solve a captcha only to hit a permission wall at the end.
  const grantable = checkRoleGrantable(interaction.guild, config.verifiedRoleId);
  if (!grantable.ok) {
    await interaction.reply({
      content: `Verification is misconfigured: ${grantable.reason} Please tell an admin.`,
      ...ephemeral,
    });
    return;
  }

  if (config.mode === "captcha") {
    const code = issueCaptcha(interaction.guildId, interaction.user.id);
    const input = new TextInputBuilder()
      .setCustomId(VERIFY_CID.codeInput)
      .setLabel(`Type this code: ${code}`)
      .setStyle(TextInputStyle.Short)
      .setMinLength(6)
      .setMaxLength(12)
      .setRequired(true)
      .setPlaceholder(code);
    const modal = new ModalBuilder()
      .setCustomId(VERIFY_CID.modal)
      .setTitle("Verify you are human")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input),
      );
    await interaction.showModal(modal);
    return;
  }

  await interaction.deferReply(ephemeral);
  const result = await verifyMember(interaction.member, config);
  await interaction.editReply({ content: result.message });
}

export async function handleVerifyModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const config = await verificationConfig(interaction.guildId);

  // Re-check on submit, not just on the button: the modal is a client-side form
  // that can be submitted long after it was opened (or replayed), so a config
  // change or a mode switch to "button" in between must not still grant a role.
  if (!config.enabled || config.mode !== "captcha") {
    await interaction.reply({
      content: "Verification isn't accepting codes right now. Press **Verify** again.",
      ...ephemeral,
    });
    return;
  }

  const answer = interaction.fields.getTextInputValue(VERIFY_CID.codeInput);
  const passed = checkCaptcha(
    interaction.guildId,
    interaction.user.id,
    answer,
  );

  await interaction.deferReply(ephemeral);

  if (!passed) {
    await interaction.editReply({
      content:
        "That code didn't match, or it expired. Press **Verify** again for a fresh one.",
    });
    return;
  }

  const result = await verifyMember(interaction.member, config);
  await interaction.editReply({ content: result.message });
}
