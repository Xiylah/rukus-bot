import { EmbedBuilder, type GuildMember } from "discord.js";
import { COLORS, type WelcomeConfig } from "@rukus/shared";
import { renderTemplate } from "./template.js";

/**
 * Build the welcome message payload: an embed when the server asked for one,
 * plain text otherwise.
 *
 * Kept separate from the join handler so the shape of a welcome can change
 * without touching the join flow, and so it can be tested on its own.
 */
export function welcomeMessagePayload(
  config: WelcomeConfig,
  member: GuildMember,
): { content?: string; embeds?: EmbedBuilder[]; allowedMentions: object } {
  // Only the member may be pinged, whichever mode is used: a welcome template
  // containing @everyone must never notify the whole server.
  const allowedMentions = { users: [member.id], parse: [] as string[] };

  if (!config.embedEnabled) {
    return {
      content: renderTemplate(config.message, member),
      allowedMentions,
    };
  }

  const embed = new EmbedBuilder();

  const hex = config.embedColor.replace(/^#/, "");
  embed.setColor(/^[0-9a-fA-F]{6}$/.test(hex) ? Number.parseInt(hex, 16) : COLORS.primary);

  if (config.embedTitle) {
    embed.setTitle(renderTemplate(config.embedTitle, member, { noMention: true }));
  }

  // The message doubles as the description, so a server switching to embed mode
  // keeps the text it already wrote rather than starting from blank.
  const description = renderTemplate(config.message, member);
  if (description) embed.setDescription(description);

  if (config.embedThumbnail === "avatar") {
    embed.setThumbnail(member.displayAvatarURL({ size: 256 }));
  } else if (config.embedThumbnail === "server") {
    const icon = member.guild.iconURL({ size: 256 });
    if (icon) embed.setThumbnail(icon);
  }

  if (config.embedImageUrl) embed.setImage(config.embedImageUrl);

  if (config.embedFooter) {
    embed.setFooter({
      text: renderTemplate(config.embedFooter, member, { noMention: true }),
    });
  }

  if (config.embedTimestamp) embed.setTimestamp();

  // A mention inside an embed renders but never notifies, so a server that
  // wants the member actually pinged needs this line outside it.
  const content = config.embedPingContent
    ? renderTemplate(config.embedPingContent, member)
    : undefined;

  return { content, embeds: [embed], allowedMentions };
}
