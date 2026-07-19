import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageFlags,
  EmbedBuilder,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { MessageContextCommand } from "../lib/types.js";
import { detectLanguage } from "../features/translation/translate.js";

const command: MessageContextCommand = {
  data: new ContextMenuCommandBuilder()
    .setName("Detect Language")
    .setType(ApplicationCommandType.Message),
  execute: async (interaction) => {
    const message = interaction.targetMessage;
    if (!message.content || !message.content.trim()) {
      await interaction.reply({
        content: "That message has no text to analyze.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await detectLanguage(
      message.content,
      interaction.guildId ?? undefined,
    );
    if (!result) {
      await interaction.editReply({
        content:
          "Couldn't detect the language - the message may be too short, slang, " +
          "or the service is busy.",
      });
      return;
    }
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("🔎 Language Detected")
          .setDescription(
            `This message appears to be **${result.name}** (\`${result.code}\`).`,
          ),
      ],
    });
  },
};

export default command;
