import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getModerationConfig, setModerationConfig } from "@rukus/db";
import { invalidate } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("moderation")
    .setDescription("Configure the moderation filters")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("drugfilter")
        .setDescription("Turn the drug/substance filter on or off")
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Enable it?").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("imageonly")
        .setDescription("Set (or clear) the image-only channel")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel where text-only messages get deleted; omit to disable")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show the current moderation settings"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const config = await getModerationConfig(guildId);

    if (sub === "status") {
      await interaction.reply({
        content:
          `**Moderation settings**\n` +
          `• Drug filter: ${config.drugFilter ? "on" : "off"}\n` +
          `• Image-only channel: ${config.imageOnlyChannelId ? `<#${config.imageOnlyChannelId}>` : "not set"}`,
        ...ephemeral,
      });
      return;
    }

    const next = { ...config };
    if (sub === "drugfilter") {
      next.drugFilter = interaction.options.getBoolean("enabled", true);
    } else if (sub === "imageonly") {
      const channel = interaction.options.getChannel("channel");
      next.imageOnlyChannelId = channel?.id ?? undefined;
    }

    await setModerationConfig(guildId, next);
    invalidate(guildId);
    await interaction.reply({
      content:
        `✅ Saved. Drug filter: **${next.drugFilter ? "on" : "off"}**, ` +
        `image-only: ${next.imageOnlyChannelId ? `<#${next.imageOnlyChannelId}>` : "**disabled**"}`,
      ...ephemeral,
    });
  },
};

export default command;
