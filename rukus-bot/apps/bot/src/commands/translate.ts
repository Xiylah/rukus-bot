import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../lib/types.js";
import { translateText } from "../features/translation/translate.js";
import { translationConfig } from "../lib/configCache.js";
import { translationEmbed } from "../features/translation/ui.js";
import { LANGUAGE_CHOICES } from "../features/translation/lang.js";

const command: Command = {
  data: (() => {
    const b = new SlashCommandBuilder()
      .setName("translate")
      .setDescription("Translate text into a chosen language")
      .addStringOption((o) =>
        o.setName("text").setDescription("The text to translate").setRequired(true),
      )
      .addStringOption((o) => {
        o.setName("to").setDescription("Target language (default English)");
        for (const [name, value] of Object.entries(LANGUAGE_CHOICES)) {
          o.addChoices({ name, value });
        }
        return o;
      });
    return b;
  })(),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const text = interaction.options.getString("text", true);
    const target = interaction.options.getString("to") ?? "en";
    await interaction.deferReply();
    const config = await translationConfig(interaction.guildId ?? "0");
    if (!config.enabled) {
      await interaction.editReply({
        content: "Translation is turned off for this server.",
      });
      return;
    }
    // force: an explicit /translate must always translate.
    const result = await translateText(text, config, { target, force: true });
    if (!result) {
      await interaction.editReply({
        content:
          "Couldn't translate that - it may be too short, already in that " +
          "language, or the service is busy. Try again in a moment.",
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
  },
};

export default command;
