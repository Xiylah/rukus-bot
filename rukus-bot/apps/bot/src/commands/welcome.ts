import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getWelcomeConfig, setWelcomeConfig } from "@rukus/db";
import { invalidate } from "../lib/configCache.js";
import { renderTemplate } from "../features/welcome/template.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configure welcome and leave messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("toggle")
        .setDescription("Turn welcome messages on or off")
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Enable them?").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("Set the welcome channel")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Where welcome messages are posted")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("message")
        .setDescription("Set the welcome message ({user} {server} {memberCount})")
        .addStringOption((o) =>
          o.setName("text").setDescription("The message").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("test").setDescription("Preview the welcome message with yourself"),
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show the current welcome settings"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const config = await getWelcomeConfig(guildId);

    if (sub === "status") {
      await interaction.reply({
        content:
          `**Welcome settings** (more options on the dashboard)\n` +
          `• Welcome: ${config.enabled ? "on" : "off"} in ${config.channelId ? `<#${config.channelId}>` : "no channel"}\n` +
          `• DM new members: ${config.dmEnabled ? "on" : "off"}\n` +
          `• Auto-roles on join: ${config.joinRoleIds.length}\n` +
          `• Leave messages: ${config.leaveEnabled ? "on" : "off"}`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "test") {
      await interaction.reply({
        content: renderTemplate(config.message, interaction.member as GuildMember),
        ...ephemeral,
      });
      return;
    }

    const next = { ...config };
    if (sub === "toggle") {
      next.enabled = interaction.options.getBoolean("enabled", true);
    } else if (sub === "channel") {
      next.channelId = interaction.options.getChannel("channel", true).id;
    } else if (sub === "message") {
      next.message = interaction.options.getString("text", true);
    }

    await setWelcomeConfig(guildId, next);
    invalidate(guildId);
    await interaction.reply({
      content: `✅ Saved. Welcome messages are **${next.enabled ? "on" : "off"}**${next.channelId ? ` in <#${next.channelId}>` : ""}.`,
      ...ephemeral,
    });
  },
};

export default command;
