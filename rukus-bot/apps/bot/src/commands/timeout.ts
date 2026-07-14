import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createCase, formatMinutes } from "../features/moderation/cases.js";
import { guardTarget } from "../features/moderation/guards.js";
import type { Command } from "../lib/types.js";

const DURATIONS = [
  { name: "10 minutes", value: 10 },
  { name: "30 minutes", value: 30 },
  { name: "1 hour", value: 60 },
  { name: "6 hours", value: 360 },
  { name: "12 hours", value: 720 },
  { name: "1 day", value: 1440 },
  { name: "3 days", value: 4320 },
  { name: "7 days", value: 10080 },
  { name: "28 days (max)", value: 40320 },
  { name: "Remove timeout", value: 0 },
];

const command: Command = {
  data: (() => {
    const b = new SlashCommandBuilder()
      .setName("timeout")
      .setDescription("Time out a member (or remove one)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption((o) =>
        o.setName("user").setDescription("Who to time out").setRequired(true),
      );
    b.addIntegerOption((o) => {
      o.setName("duration").setDescription("How long").setRequired(true);
      for (const d of DURATIONS) o.addChoices(d);
      return o;
    });
    b.addStringOption((o) =>
      o.setName("reason").setDescription("Why").setMaxLength(500),
    );
    b.addAttachmentOption((o) =>
      o.setName("proof").setDescription("Screenshot or image evidence (stored permanently)"),
    );
    return b;
  })(),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser("user", true);
    const minutes = interaction.options.getInteger("duration", true);
    const reason = interaction.options.getString("reason") ?? undefined;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      await interaction.reply({
        content: "That user isn't in the server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const blocked = guardTarget(interaction, target, member, "moderatable");
    if (blocked) {
      await interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });
      return;
    }

    const removing = minutes === 0;
    await member.timeout(
      removing ? null : minutes * 60_000,
      `${interaction.user.tag}: ${reason ?? "no reason"}`,
    );

    const { number, recorded, proofUrl, proofError } = await createCase({
      guild: interaction.guild,
      action: removing ? "UNTIMEOUT" : "TIMEOUT",
      target,
      moderatorId: interaction.user.id,
      reason,
      durationMin: removing ? undefined : minutes,
      proof: interaction.options.getAttachment("proof"),
    });

    await interaction.reply({
      content: removing
        ? `🔊 Timeout removed for ${target}.${recorded ? ` Case #${String(number).padStart(4, "0")}.` : ""}`
        : `🔇 ${target} timed out for ${formatMinutes(minutes)}.${recorded ? ` Case #${String(number).padStart(4, "0")}.` : ""}${reason ? ` Reason: ${reason}` : ""}` +
          (proofUrl ? `
Proof: ${proofUrl}` : "") +
          (proofError ? `
(Proof skipped: ${proofError})` : ""),
    });
  },
};

export default command;
