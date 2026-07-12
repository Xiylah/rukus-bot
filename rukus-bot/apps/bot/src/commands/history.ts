import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import { userHistory, formatMinutes, ACTION_STYLE } from "../features/moderation/cases.js";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("Show a member's moderation record")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Whose record").setRequired(true),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser("user", true);
    const { cases, counts } = await userHistory(interaction.guildId, target.id);

    if (cases.length === 0) {
      await interaction.reply({
        content: `${target.tag} has a clean record. ✨`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const summary = counts
      .map((c) => `${c._count}x ${c.action}`)
      .join(" • ");
    const base = process.env.DASHBOARD_URL?.replace(/\/+$/, "");
    const lines = cases.map((c) => {
      const style = ACTION_STYLE[c.action];
      const when = `<t:${Math.floor(c.createdAt.getTime() / 1000)}:R>`;
      const dur = c.durationMin ? ` (${formatMinutes(c.durationMin)})` : "";
      const proof = c.proofToken && base ? ` [📎 proof](${base}/proof/${c.proofToken})` : "";
      return `${style.emoji} **#${String(c.number).padStart(4, "0")}** ${c.action}${dur} by <@${c.moderatorId}> ${when}${proof}\n${c.reason ? `> ${c.reason.slice(0, 120)}` : "> no reason"}`;
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`Moderation record: ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ size: 64 }))
      .setDescription(lines.join("\n").slice(0, 4000))
      .setFooter({ text: summary });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
