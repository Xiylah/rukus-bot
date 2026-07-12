import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getModerationConfig } from "@rukus/db";
import { createCase } from "../features/moderation/cases.js";
import { guardTarget } from "../features/moderation/guards.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Give a member the muted role (recorded as a case)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Who to mute").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Why").setMaxLength(500),
    )
    .addAttachmentOption((o) =>
      o
        .setName("proof")
        .setDescription("Screenshot or image evidence (stored permanently)"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await getModerationConfig(interaction.guildId);
    if (!config.mutedRoleId) {
      await interaction.reply({
        content:
          "No muted role is configured. Set one on the dashboard: " +
          "**Moderation > Staff settings > Muted role**.",
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
    const blocked = guardTarget(interaction, target, member, "moderatable");
    if (blocked) {
      await interaction.reply({ content: blocked, ...ephemeral });
      return;
    }
    if (member.roles.cache.has(config.mutedRoleId)) {
      await interaction.reply({
        content: `${target} is already muted.`,
        ...ephemeral,
      });
      return;
    }

    try {
      await member.roles.add(
        config.mutedRoleId,
        `${interaction.user.tag}: ${reason ?? "no reason"}`,
      );
    } catch {
      await interaction.reply({
        content:
          "I couldn't add the muted role. It's probably above my own role in " +
          "the role list, or I'm missing **Manage Roles**.",
        ...ephemeral,
      });
      return;
    }

    const { number, proofUrl, proofError } = await createCase({
      guild: interaction.guild,
      action: "MUTE",
      target,
      moderatorId: interaction.user.id,
      reason,
      proof: interaction.options.getAttachment("proof"),
    });

    await interaction.reply({
      content:
        `🤐 ${target} has been muted. Case #${String(number).padStart(4, "0")}.` +
        (reason ? ` Reason: ${reason}` : "") +
        (proofUrl ? `\nProof: ${proofUrl}` : "") +
        (proofError ? `\n(Proof skipped: ${proofError})` : ""),
    });
  },
};

export default command;
