import { FileUploadBuilder, LabelBuilder, ModalBuilder, MessageFlags, type ButtonInteraction, type ModalSubmitInteraction } from "discord.js";
import { BAH_FILE_ID, BAH_UPLOAD_ID, BUILD_A_HOUSE_GUILD_ID } from "@rukus/shared";
import { getBuildAHouseConfig } from "@rukus/db";
import { submitStatCard } from "./submissions.js";

export function statCardUploadModal() {
  return new ModalBuilder().setCustomId(BAH_UPLOAD_ID).setTitle("Submit Stat Card")
    .addLabelComponents(new LabelBuilder().setLabel("Stat card photo").setDescription("A clear PNG or JPEG screenshot of your whole card (up to 8 MB)")
      .setFileUploadComponent(new FileUploadBuilder().setCustomId(BAH_FILE_ID).setMinValues(1).setMaxValues(1).setRequired(true)));
}

export async function handleStatCardButton(interaction: ButtonInteraction) {
  if (interaction.guildId !== BUILD_A_HOUSE_GUILD_ID) return;
  const config = await getBuildAHouseConfig(BUILD_A_HOUSE_GUILD_ID);
  if (!config.submissionChannelId || config.submissionChannelId !== interaction.channelId || config.panelMessageId !== interaction.message.id) {
    await interaction.reply({ content: "Use the current stat-card panel in the submission channel.", flags: MessageFlags.Ephemeral }); return;
  }
  await interaction.showModal(statCardUploadModal());
}

export async function handleStatCardModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (interaction.guildId !== BUILD_A_HOUSE_GUILD_ID || !interaction.channelId) {
    await interaction.editReply("This form is not available here."); return;
  }
  const config = await getBuildAHouseConfig(BUILD_A_HOUSE_GUILD_ID);
  if (config.submissionChannelId !== interaction.channelId) {
    await interaction.editReply("Use the stat-card panel in the current submission channel."); return;
  }
  const files = interaction.fields.getUploadedFiles(BAH_FILE_ID, true);
  if (files.size !== 1) { await interaction.editReply("Upload one stat-card image."); return; }
  await submitStatCard({ userId: interaction.user.id, displayName: interaction.user.username,
    channelId: interaction.channelId, attachment: files.first()!,
    reply: (content) => interaction.editReply({ content, allowedMentions: { parse: [] } }),
  });
}
