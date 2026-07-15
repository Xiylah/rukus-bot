import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { prisma, type SuggestionStatus } from "@rukus/db";
import { suggestionsConfig } from "../lib/configCache.js";
import { resolvedMention } from "../lib/mentions.js";
import {
  getSuggestion,
  refreshSuggestionMessage,
  statusMeta,
} from "../features/suggestions/service.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** Each subcommand maps to exactly one status, so they share one handler. */
const SUB_TO_STATUS: Record<string, SuggestionStatus> = {
  approve: "APPROVED",
  deny: "DENIED",
  consider: "CONSIDERED",
  implement: "IMPLEMENTED",
};

/** The four decision subcommands differ only by name and description. */
function decisionSub(name: string, description: string) {
  return (s: import("discord.js").SlashCommandSubcommandBuilder) =>
    s
      .setName(name)
      .setDescription(description)
      .addIntegerOption((o) =>
        o
          .setName("number")
          .setDescription("The suggestion number (the #12 in the embed title)")
          .setMinValue(1)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("reason")
          .setDescription("Shown publicly on the suggestion")
          .setMaxLength(1000),
      );
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Decide on a member suggestion (staff)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand(decisionSub("approve", "Approve a suggestion"))
    .addSubcommand(decisionSub("deny", "Deny a suggestion"))
    .addSubcommand(
      decisionSub("consider", "Mark a suggestion as under consideration"),
    )
    .addSubcommand(decisionSub("implement", "Mark a suggestion as implemented")),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const status = SUB_TO_STATUS[interaction.options.getSubcommand()];
    if (!status) return;

    const number = interaction.options.getInteger("number", true);
    const reason = interaction.options.getString("reason");
    const config = await suggestionsConfig(interaction.guildId);

    const existing = await getSuggestion(interaction.guildId, number);
    if (!existing) {
      await interaction.reply({
        content: `No suggestion **#${number}** on this server.`,
        ...ephemeral,
      });
      return;
    }

    await interaction.deferReply(ephemeral);

    const suggestion = await prisma.suggestion.update({
      where: { guildId_number: { guildId: interaction.guildId, number } },
      data: { status, reason, staffId: interaction.user.id },
    });

    const refreshed = await refreshSuggestionMessage(
      interaction.guild,
      suggestion,
      config,
    );

    const meta = statusMeta(status);

    // The decision channel is a separate feed so the voting channel is not the
    // place people have to scroll to find out what actually happened.
    if (config.decisionChannelId) {
      const channel =
        interaction.guild.channels.cache.get(config.decisionChannelId) ??
        (await interaction.guild.channels
          .fetch(config.decisionChannelId)
          .catch(() => null));
      if (channel?.isTextBased()) {
        const link = `https://discord.com/channels/${interaction.guildId}/${suggestion.channelId}/${suggestion.messageId}`;
        const embed = new EmbedBuilder()
          .setColor(meta.color)
          .setTitle(`${meta.emoji} Suggestion #${number} ${meta.label.toLowerCase()}`)
          .setDescription(suggestion.text.slice(0, 2000))
          .addFields({
            name: "Decided by",
            value: await resolvedMention(interaction.guild, interaction.user.id),
          });
        if (reason) embed.addFields({ name: "Reason", value: reason });
        if (!config.anonymous) {
          embed.addFields({
            name: "Suggested by",
            value: await resolvedMention(interaction.guild, suggestion.authorId),
          });
        }
        embed.addFields({ name: "Original", value: `[Jump](${link})` });
        await (channel as TextChannel)
          .send({ embeds: [embed], allowedMentions: { parse: [] } })
          .catch(() => {});
      }
    }

    await interaction.editReply({
      content:
        `${meta.emoji} Suggestion **#${number}** is now **${meta.label}**.` +
        (refreshed ? "" : "\n⚠️ The original message is gone, so its embed could not be updated."),
    });
  },
};

export default command;
