import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getTranslationConfig, setTranslationConfig } from "@rukus/db";
import { invalidate } from "../lib/configCache.js";
import { LANGUAGE_CHOICES } from "../features/translation/lang.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: (() => {
    const b = new SlashCommandBuilder()
      .setName("translation")
      .setDescription("Configure the translation feature")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .setDMPermission(false)
      .addSubcommand((s) =>
        s
          .setName("auto")
          .setDescription("Turn auto-translation of foreign messages on or off")
          .addBooleanOption((o) =>
            o.setName("enabled").setDescription("Enable it?").setRequired(true),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("flags")
          .setDescription("Turn flag-reaction translations on or off")
          .addBooleanOption((o) =>
            o.setName("enabled").setDescription("Enable it?").setRequired(true),
          ),
      )
      .addSubcommand((s) => {
        s.setName("target").setDescription(
          "Set the language auto-translation translates INTO",
        );
        s.addStringOption((o) => {
          o.setName("language").setDescription("Target language").setRequired(true);
          for (const [name, value] of Object.entries(LANGUAGE_CHOICES)) {
            o.addChoices({ name, value });
          }
          return o;
        });
        return s;
      })
      .addSubcommand((s) =>
        s.setName("status").setDescription("Show the current translation settings"),
      );
    return b;
  })(),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const config = await getTranslationConfig(guildId);

    if (sub === "status") {
      await interaction.reply({
        content:
          `**Translation settings**\n` +
          `• Auto-translate: ${config.autoTranslate ? "on" : "off"}\n` +
          `• Flag reactions: ${config.flagReactions ? "on" : "off"}\n` +
          `• Target language: \`${config.targetLang}\``,
        ...ephemeral,
      });
      return;
    }

    const next = { ...config };
    if (sub === "auto") {
      next.autoTranslate = interaction.options.getBoolean("enabled", true);
    } else if (sub === "flags") {
      next.flagReactions = interaction.options.getBoolean("enabled", true);
    } else if (sub === "target") {
      next.targetLang = interaction.options.getString("language", true);
    }

    await setTranslationConfig(guildId, next);
    invalidate(guildId);
    await interaction.reply({
      content:
        `✅ Saved. Auto-translate: **${next.autoTranslate ? "on" : "off"}**, ` +
        `flag reactions: **${next.flagReactions ? "on" : "off"}**, ` +
        `target: \`${next.targetLang}\``,
      ...ephemeral,
    });
  },
};

export default command;
