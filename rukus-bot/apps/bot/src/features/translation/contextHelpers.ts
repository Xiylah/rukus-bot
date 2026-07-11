import {
  MessageFlags,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { translateText } from "./translate.js";
import { translationEmbed } from "./ui.js";

/** Shared handler: translate the right-clicked message into `target`. */
export async function contextTranslate(
  interaction: MessageContextMenuCommandInteraction,
  target: string,
) {
  const message = interaction.targetMessage;
  if (!message.content || !message.content.trim()) {
    await interaction.reply({
      content: "That message has no text to translate.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply();
  const result = await translateText(message.content, target);
  if (!result) {
    await interaction.editReply({
      content:
        "Couldn't translate that - it may be too short, slang, already in " +
        "that language, or the service is busy.",
    });
    return;
  }
  await interaction.editReply({
    embeds: [
      translationEmbed({
        translated: result.text,
        src: result.src,
        target,
        requester: interaction.user.displayName,
      }),
    ],
  });
}
