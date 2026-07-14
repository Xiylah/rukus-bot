import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";
import { inviteTrackerConfig } from "../lib/configCache.js";
import { inviteCount, topInviters } from "../features/invites/service.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("invites")
    .setDescription("How many members someone has invited")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Whose invites to count (default: you)"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;

    const config = await inviteTrackerConfig(guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "Invite tracking is turned off in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const user = interaction.options.getUser("user") ?? interaction.user;
    const [count, top] = await Promise.all([
      inviteCount(guildId, user.id),
      topInviters(guildId, 5),
    ]);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
      .setTitle(
        count === 1 ? "1 member invited" : `${count} members invited`,
      )
      .setFooter({
        // The count only covers joins the bot could actually attribute, and
        // saying so up front is better than someone quietly concluding the
        // number is wrong.
        text: "Only counts joins I was able to trace back to an invite.",
      });

    if (top.length > 0) {
      embed.addFields({
        name: "Top inviters",
        value: top
          .map((t, i) => `**${i + 1}.** <@${t.inviterId}> - ${t.count}`)
          .join("\n"),
      });
    }

    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
