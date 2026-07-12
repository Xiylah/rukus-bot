import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createCase } from "../features/moderation/cases.js";
import { guardTarget } from "../features/moderation/guards.js";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Who to kick").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Why").setMaxLength(500),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? undefined;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      await interaction.reply({
        content: "That user isn't in the server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const blocked = guardTarget(interaction, target, member, "kickable");
    if (blocked) {
      await interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });
      return;
    }

    // Record + DM BEFORE the kick, or the DM can no longer be delivered.
    const number = await createCase({
      guild: interaction.guild,
      action: "KICK",
      target,
      moderatorId: interaction.user.id,
      reason,
    });
    await member.kick(`${interaction.user.tag}: ${reason ?? "no reason"}`);

    await interaction.reply({
      content: `👢 ${target.tag} was kicked. Case #${String(number).padStart(4, "0")}.${reason ? ` Reason: ${reason}` : ""}`,
    });
  },
};

export default command;
