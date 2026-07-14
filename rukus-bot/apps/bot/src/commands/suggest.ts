import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { prisma } from "@rukus/db";
import { suggestionsConfig } from "../lib/configCache.js";
import {
  nextSuggestionNumber,
  suggestionEmbed,
} from "../features/suggestions/service.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a suggestion for the server")
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName("text")
        .setDescription("What are you suggesting?")
        .setMinLength(10)
        .setMaxLength(1800)
        .setRequired(true),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await suggestionsConfig(interaction.guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "Suggestions aren't enabled on this server.",
        ...ephemeral,
      });
      return;
    }
    if (!config.channelId) {
      await interaction.reply({
        content:
          "No suggestions channel is set. An admin needs to pick one in the dashboard.",
        ...ephemeral,
      });
      return;
    }

    const channel =
      interaction.guild.channels.cache.get(config.channelId) ??
      (await interaction.guild.channels
        .fetch(config.channelId)
        .catch(() => null));
    if (!channel?.isTextBased()) {
      await interaction.reply({
        content: "The configured suggestions channel is missing or unreadable.",
        ...ephemeral,
      });
      return;
    }
    const board = channel as TextChannel;

    const text = interaction.options.getString("text", true);

    // Ephemeral even when the post is public: the reply is just a receipt, and
    // when anonymous mode is on a public reply would name the author anyway.
    await interaction.deferReply(ephemeral);

    const number = await nextSuggestionNumber(interaction.guildId);
    const embed = suggestionEmbed(
      {
        number,
        text,
        authorId: interaction.user.id,
        status: "PENDING",
        reason: null,
        staffId: null,
      },
      config,
      {
        name: interaction.user.displayName || interaction.user.username,
        iconURL: interaction.user.displayAvatarURL(),
      },
    );

    const message = await board.send({ embeds: [embed] });

    await prisma.suggestion.create({
      data: {
        guildId: interaction.guildId,
        number,
        channelId: board.id,
        messageId: message.id,
        authorId: interaction.user.id,
        text,
        status: "PENDING",
      },
    });

    if (config.allowVoting) {
      // Sequential, not parallel: Discord orders reactions by arrival, and a
      // race would sometimes render the downvote to the left of the upvote.
      await message.react(config.upvoteEmoji).catch(() => {});
      await message.react(config.downvoteEmoji).catch(() => {});
    }

    if (config.threadPerSuggestion) {
      await message
        .startThread({
          name: `Suggestion #${number}`.slice(0, 100),
          // A week, so discussion does not archive while the suggestion is
          // still waiting on a staff decision.
          autoArchiveDuration: 10080,
        })
        .catch(() => {});
    }

    await interaction.editReply({
      content: `✅ Suggestion **#${number}** posted in <#${board.id}>.`,
    });
  },
};

export default command;
