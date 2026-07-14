import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getReactionRolesConfig, setReactionRolesConfig } from "@rukus/db";
import { MODE_HELP } from "@rukus/shared";
import { invalidate } from "../lib/configCache.js";
import { canManageGuild } from "../lib/perms.js";
import { findPanel, publishPanel } from "../features/reactionroles/panel.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("reactionroles")
    .setDescription("Post and inspect self-role panels")
    // Every subcommand here is staff-only. Without this the command still
    // refuses non-staff, but Discord shows it to everyone, so members see a
    // command they can only ever be told off for using.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("post")
        .setDescription("Post a panel (or update it in place) in its channel")
        .addStringOption((o) =>
          o
            .setName("panel")
            .setDescription("The panel's id or title (see /reactionroles list)")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("List this server's self-role panels"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const member = interaction.member as GuildMember;
    if (!canManageGuild(member)) {
      await interaction.reply({
        content: "You need **Manage Server** to use self-role panels.",
        ...ephemeral,
      });
      return;
    }

    // Read straight through the cache: an admin who just saved in the dashboard
    // expects /reactionroles post to publish what they saved, not a 15s-old copy.
    const config = await getReactionRolesConfig(interaction.guildId);

    if (interaction.options.getSubcommand() === "list") {
      if (config.panels.length === 0) {
        await interaction.reply({
          content:
            "No panels yet. Build one in the dashboard under **Reaction Roles**, then run `/reactionroles post`.",
          ...ephemeral,
        });
        return;
      }
      const lines = config.panels.map((p) => {
        const where =
          p.messageId && p.channelId
            ? `[posted](https://discord.com/channels/${interaction.guildId}/${p.channelId}/${p.messageId})`
            : "not posted yet";
        return (
          `**${p.title}** \`${p.id}\`\n` +
          `${p.channelId ? `<#${p.channelId}>` : "_no channel_"} | ${p.style} | ` +
          `${p.mode} | ${p.pairs.length} role(s) | ${where}`
        );
      });
      await interaction.reply({
        content:
          (config.enabled ? "" : "⚠️ Self-roles are **disabled** in the dashboard.\n\n") +
          lines.join("\n\n"),
        ...ephemeral,
      });
      return;
    }

    // ---- post ----
    const query = interaction.options.getString("panel", true);
    const panel = findPanel(config, query);
    if (!panel) {
      await interaction.reply({
        content: `No panel matches \`${query}\`. Run \`/reactionroles list\` to see them.`,
        ...ephemeral,
      });
      return;
    }

    if (!panel.channelId) {
      await interaction.reply({
        content: "That panel has no channel set. Pick one in the dashboard first.",
        ...ephemeral,
      });
      return;
    }

    const channel = await interaction.guild.channels
      .fetch(panel.channelId)
      .catch(() => null);
    if (!channel || !channel.isTextBased()) {
      await interaction.reply({
        content: "That panel's channel is gone. Pick a new one in the dashboard.",
        ...ephemeral,
      });
      return;
    }

    await interaction.deferReply(ephemeral);

    const posted = await publishPanel(channel as TextChannel, panel);

    // Remember where it lives so the next post edits instead of duplicating.
    if (posted.messageId !== panel.messageId) {
      await setReactionRolesConfig(interaction.guildId, {
        ...config,
        panels: config.panels.map((p) =>
          p.id === panel.id ? { ...p, messageId: posted.messageId } : p,
        ),
      });
      invalidate(interaction.guildId);
    }

    await interaction.editReply({
      content:
        `${posted.updated ? "♻️ Updated" : "✅ Posted"} **${panel.title}** in <#${panel.channelId}>.\n` +
        `Mode: **${panel.mode}** - ${MODE_HELP[panel.mode]}`,
    });
  },
};

export default command;
