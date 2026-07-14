import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
  type TextChannel,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import { utilityConfig } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/**
 * Parse a color the way staff actually write one: "#5865F2", "5865f2", or one
 * of our brand names. Returns null when it's unreadable, so the caller can say
 * so rather than posting a silently-black embed.
 */
export function parseColor(input: string | null): number | null | undefined {
  if (!input) return undefined; // not supplied: use the default
  const text = input.trim().toLowerCase().replace(/^#/, "");

  const named: Record<string, number> = {
    primary: COLORS.primary,
    blurple: COLORS.primary,
    success: COLORS.success,
    green: COLORS.success,
    danger: COLORS.danger,
    red: COLORS.danger,
    warning: COLORS.warning,
    yellow: COLORS.warning,
    neutral: COLORS.neutral,
    grey: COLORS.neutral,
    gray: COLORS.neutral,
  };
  if (named[text] !== undefined) return named[text];

  if (!/^[0-9a-f]{6}$/.test(text)) return null;
  return Number.parseInt(text, 16);
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Post a formatted embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("title").setDescription("Embed title").setMaxLength(256),
    )
    .addStringOption((o) =>
      o
        .setName("description")
        .setDescription("Body text. Use \\n for a line break.")
        .setMaxLength(4000),
    )
    .addStringOption((o) =>
      o
        .setName("color")
        .setDescription('Hex like "#5865F2", or: primary, success, danger, warning'),
    )
    .addStringOption((o) =>
      o.setName("image").setDescription("Image URL (shown large)"),
    )
    .addStringOption((o) =>
      o.setName("thumbnail").setDescription("Thumbnail URL (shown small, top-right)"),
    )
    .addStringOption((o) =>
      o.setName("footer").setDescription("Footer text").setMaxLength(2048),
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
    if (!config.enabled || !config.embedBuilder) {
      await interaction.reply({
        content: "The embed builder is turned off in this server.",
        ...ephemeral,
      });
      return;
    }

    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");
    const image = interaction.options.getString("image");
    const thumbnail = interaction.options.getString("thumbnail");
    const footer = interaction.options.getString("footer");

    if (!title && !description && !image) {
      await interaction.reply({
        content: "An embed needs at least a title, a description, or an image.",
        ...ephemeral,
      });
      return;
    }

    const color = parseColor(interaction.options.getString("color"));
    if (color === null) {
      await interaction.reply({
        content: 'I couldn\'t read that color. Use a hex like "#5865F2", or a name like "success".',
        ...ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder().setColor(color ?? COLORS.primary);
    if (title) embed.setTitle(title);
    // Slash-command text can't contain a real newline, so "\n" is the only way
    // staff can express one from the Discord client.
    if (description) embed.setDescription(description.replace(/\\n/g, "\n"));
    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (footer) embed.setFooter({ text: footer });

    const channel = (interaction.options.getChannel("channel") ??
      interaction.channel) as TextChannel | null;
    if (!channel?.isSendable()) {
      await interaction.reply({
        content: "I can't post in that channel.",
        ...ephemeral,
      });
      return;
    }

    const sent = await channel.send({ embeds: [embed] }).catch(() => null);
    if (!sent) {
      await interaction.reply({
        content:
          "Discord refused that. The image URL may be invalid, or I'm missing " +
          "**Send Messages** / **Embed Links** there.",
        ...ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: `✅ Posted: ${sent.url}`,
      ...ephemeral,
    });
  },
};

export default command;
