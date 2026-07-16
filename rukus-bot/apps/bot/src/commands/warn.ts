import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createCase } from "../features/moderation/cases.js";
import { escalateIfNeeded } from "../features/moderation/escalation.js";
import { guardTarget } from "../features/moderation/guards.js";
import { moderationConfig } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member (recorded as a case)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Who to warn").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Why").setRequired(true).setMaxLength(500),
    )
    .addAttachmentOption((o) =>
      o.setName("proof").setDescription("Screenshot or image evidence (stored permanently)"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    const blocked = guardTarget(interaction, target, member, "moderatable");
    if (blocked) {
      await interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });
      return;
    }

    const { number, recorded, proofUrl, proofError } = await createCase({
      guild: interaction.guild,
      action: "WARN",
      target,
      moderatorId: interaction.user.id,
      reason,
      proof: interaction.options.getAttachment("proof"),
    });

    // Warn escalation runs AFTER the warn case exists, so the fresh warn counts.
    // It never throws (it posts a mod-log note on failure), and it applies its
    // own case + DM, so the reply just needs to surface what it did.
    const config = await moderationConfig(interaction.guild.id);
    const escalated = await escalateIfNeeded(
      interaction.guild,
      target.id,
      config,
    );

    await interaction.reply({
      content:
        `⚠️ ${target} has been warned.${recorded ? ` Case #${String(number).padStart(4, "0")}.` : ""} Reason: ${reason}` +
        (escalated ? `
↳ Auto-escalation: ${target} was ${escalated}.` : "") +
        (proofUrl ? `
Proof: ${proofUrl}` : "") +
        (proofError ? `
(Proof skipped: ${proofError})` : ""),
    });
  },
};

export default command;
