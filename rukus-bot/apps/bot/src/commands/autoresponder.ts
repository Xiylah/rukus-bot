import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getAutoResponderConfig, setAutoResponderConfig } from "@rukus/db";
import { invalidate } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("autoresponder")
    .setDescription("Configure the event/lost-item auto-responder")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("toggle")
        .setDescription("Turn the auto-responder on or off")
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Enable it?").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("channels")
        .setDescription("Set the channels the replies point members to")
        .addChannelOption((o) =>
          o
            .setName("events")
            .setDescription("Channel for event questions")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("support")
            .setDescription("Channel for lost-item reports")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("addphrase")
        .setDescription("Teach the responder a new event phrasing")
        .addStringOption((o) =>
          o
            .setName("phrase")
            .setDescription('e.g. "when is the tournament"')
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show the current auto-responder settings"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const config = await getAutoResponderConfig(guildId);

    if (sub === "status") {
      await interaction.reply({
        content:
          `**Auto-responder settings**\n` +
          `• Enabled: ${config.enabled ? "yes" : "no"}\n` +
          `• Events channel: ${config.eventChannelId ? `<#${config.eventChannelId}>` : "not set"}\n` +
          `• Support channel: ${config.supportChannelId ? `<#${config.supportChannelId}>` : "not set"}\n` +
          `• Custom phrases: ${config.extraEventPhrases.length}`,
        ...ephemeral,
      });
      return;
    }

    const next = { ...config };
    if (sub === "toggle") {
      next.enabled = interaction.options.getBoolean("enabled", true);
    } else if (sub === "channels") {
      const events = interaction.options.getChannel("events");
      const support = interaction.options.getChannel("support");
      if (events) next.eventChannelId = events.id;
      if (support) next.supportChannelId = support.id;
    } else if (sub === "addphrase") {
      const phrase = interaction.options.getString("phrase", true).trim();
      if (!next.extraEventPhrases.includes(phrase)) {
        next.extraEventPhrases = [...next.extraEventPhrases, phrase];
      }
    }

    await setAutoResponderConfig(guildId, next);
    invalidate(guildId);
    await interaction.reply({
      content: `✅ Saved. Auto-responder is **${next.enabled ? "on" : "off"}** with ${next.extraEventPhrases.length} custom phrase(s).`,
      ...ephemeral,
    });
  },
};

export default command;
