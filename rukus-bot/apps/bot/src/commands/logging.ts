import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getLoggingConfig, setLoggingConfig } from "@rukus/db";
import { invalidate } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** Each stream's config field, plus the label /logging status prints. */
const STREAMS = [
  { option: "messages", field: "messageChannelId", label: "Messages" },
  { option: "members", field: "memberChannelId", label: "Members" },
  { option: "server", field: "serverChannelId", label: "Server" },
  { option: "voice", field: "voiceChannelId", label: "Voice" },
  { option: "joins", field: "joinChannelId", label: "Joins & leaves" },
] as const;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("Configure server logging")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Turn logging on and point every stream at a channel")
        .addChannelOption((o) =>
          o
            .setName("default")
            .setDescription("Fallback channel for any stream with no channel of its own")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addChannelOption((o) =>
          o
            .setName("messages")
            .setDescription("Deletes, edits, purges")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("members")
            .setDescription("Bans, kicks, role and nickname changes")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("server")
            .setDescription("Channels, roles, emojis, invites, server settings")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("voice")
            .setDescription("Voice joins, leaves, and moves")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("joins")
            .setDescription("Members joining and leaving")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show where each log stream is going"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;
    const config = await getLoggingConfig(guildId);

    if (interaction.options.getSubcommand() === "status") {
      const fallback = config.defaultChannelId
        ? `<#${config.defaultChannelId}>`
        : "*not set*";

      // Show the EFFECTIVE destination, not the raw field: "same as default" is
      // the answer to the question people are actually asking.
      const lines = STREAMS.map((s) => {
        const own = config[s.field];
        return `• ${s.label}: ${own ? `<#${own}>` : `${fallback} (default)`}`;
      });

      const ignored = [
        config.ignoreChannelIds.length
          ? `${config.ignoreChannelIds.length} channel(s)`
          : null,
        config.ignoreUserIds.length ? `${config.ignoreUserIds.length} user(s)` : null,
        config.ignoreBots ? "bots" : null,
        config.ignorePrefixes.length
          ? `prefixes ${config.ignorePrefixes.map((p) => `\`${p}\``).join(" ")}`
          : null,
      ].filter(Boolean);

      await interaction.reply({
        content:
          `**Logging** (full event toggles are on the dashboard)\n` +
          `• Status: ${config.enabled ? "on" : "off"}\n` +
          `• Default channel: ${fallback}\n` +
          lines.join("\n") +
          `\n• Ignoring: ${ignored.length ? ignored.join(", ") : "nothing"}`,
        ...ephemeral,
      });
      return;
    }

    // ---- setup ----
    const next = { ...config, enabled: true };
    next.defaultChannelId = interaction.options.getChannel("default", true).id;
    for (const s of STREAMS) {
      const picked = interaction.options.getChannel(s.option);
      // Only overwrite what was actually passed: re-running /logging setup to
      // change one stream must not silently clear the other four.
      if (picked) next[s.field] = picked.id;
    }

    await setLoggingConfig(guildId, next);
    invalidate(guildId);

    await interaction.reply({
      content:
        `✅ Logging is **on**. Default channel: <#${next.defaultChannelId}>.\n` +
        `Make sure I can **View Channel**, **Send Messages**, and **Embed Links** there, ` +
        `and grant me **View Audit Log** so bans, kicks, and deletes show who did them.\n` +
        `Fine-tune which events are logged on the dashboard.`,
      ...ephemeral,
    });
  },
};

export default command;
