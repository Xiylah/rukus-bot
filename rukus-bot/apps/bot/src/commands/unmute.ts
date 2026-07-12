import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getModerationConfig } from "@rukus/db";
import { createCase } from "../features/moderation/cases.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove the muted role from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Who to unmute").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Why").setMaxLength(500),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await getModerationConfig(interaction.guildId);
    if (!config.mutedRoleId) {
      await interaction.reply({
        content: "No muted role is configured on the dashboard.",
        ...ephemeral,
      });
      return;
    }

    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? undefined;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      await interaction.reply({
        content: "That user isn't in the server.",
        ...ephemeral,
      });
      return;
    }
    if (!member.roles.cache.has(config.mutedRoleId)) {
      await interaction.reply({
        content: `${target} isn't muted.`,
        ...ephemeral,
      });
      return;
    }

    try {
      await member.roles.remove(
        config.mutedRoleId,
        `${interaction.user.tag}: ${reason ?? "no reason"}`,
      );
    } catch {
      await interaction.reply({
        content: "I couldn't remove the muted role (missing permission?).",
        ...ephemeral,
      });
      return;
    }

    const { number } = await createCase({
      guild: interaction.guild,
      action: "UNMUTE",
      target,
      moderatorId: interaction.user.id,
      reason,
    });

    await interaction.reply({
      content: `🗣️ ${target} has been unmuted. Case #${String(number).padStart(4, "0")}.`,
    });
  },
};

export default command;
