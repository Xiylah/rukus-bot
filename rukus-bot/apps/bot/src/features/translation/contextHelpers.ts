import {
  MessageFlags,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { translateText } from "./translate.js";
import { translationEmbed } from "./ui.js";
import { translationConfig } from "../../lib/configCache.js";

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
  const config = await translationConfig(interaction.guildId ?? "0");
  if (!config.enabled) {
    await interaction.editReply({
      content: "Translation is turned off for this server.",
    });
    return;
  }
  // force: the user right-clicked and asked for this, so the slang/length
  // rules that guard AUTO-translation must not refuse them.
  const result = await translateText(message.content, config, {
    target,
    force: true,
    guildId: interaction.guildId ?? undefined,
  });
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
