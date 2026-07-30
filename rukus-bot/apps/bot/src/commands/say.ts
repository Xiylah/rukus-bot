import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  type TextChannel,
  type ChatInputCommandInteraction,
} from "discord.js";
import { utilityConfig } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/**
 * Make the bot say something as a plain message.
 *
 * The bare-text counterpart to /embed: same permission gate and channel
 * resolution, but no embed box. Some announcements read better as ordinary text
 * (a one-liner, a link that should unfurl its own preview), which an embed
 * cannot do because links inside an embed do not generate previews.
 *
 * Gated on ManageMessages, like /embed and /poll: speaking as the bot is a
 * staff action, since the message carries the bot's name and cannot be traced
 * to who sent it without the audit log.
 */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot say a plain message")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName("message")
        .setDescription("What the bot should say. Use \\n for a line break.")
        .setRequired(true)
        .setMaxLength(2000),
    )
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Where to post it (defaults to here)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await utilityConfig(interaction.guildId);
    // Rides along with the embed-builder switch: both are "post as the bot"
    // tools, so a server that turned that off does not want this either.
    if (!config.enabled || !config.embedBuilder) {
      await interaction.reply({
        content: "The bot's message tools are turned off in this server.",
        ...ephemeral,
      });
      return;
    }

    // Slash-command text cannot contain a real newline, so "\n" is the only way
    // staff can express one from the Discord client.
    const message = interaction.options
      .getString("message", true)
      .replace(/\\n/g, "\n");

    const channel = (interaction.options.getChannel("channel") ??
      interaction.channel) as TextChannel | null;
    if (!channel?.isSendable()) {
      await interaction.reply({
        content: "I can't post in that channel.",
        ...ephemeral,
      });
      return;
    }

    const sent = await channel
      .send({
        content: message,
        // No pings. /say speaks as the bot, so an @everyone typed into it would
        // let anyone with ManageMessages ping the whole server under the bot's
        // name. Staff who genuinely need to ping can do it as themselves.
        allowedMentions: { parse: [] },
      })
      .catch(() => null);

    if (!sent) {
      await interaction.reply({
        content:
          "Discord refused that. I may be missing **Send Messages** in that channel.",
        ...ephemeral,
      });
      return;
    }

    await interaction.reply({ content: `✅ Sent: ${sent.url}`, ...ephemeral });
  },
};

export default command;
