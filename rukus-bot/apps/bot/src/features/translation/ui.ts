import { EmbedBuilder } from "discord.js";
import { COLORS } from "@rukus/shared";

/** Build the standard translation result embed. */
export function translationEmbed(params: {
  translated: string;
  src: string;
  target: string;
  requester?: string;
}): EmbedBuilder {
  const { translated, src, target, requester } = params;
  const srcLabel = src && src !== "auto" ? src.toUpperCase() : "Auto-detected";
  let footer = `${srcLabel} → ${target.toUpperCase()}`;
  if (requester) footer += ` • requested by ${requester}`;
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("🌐 Translation")
    .setDescription(translated.slice(0, 4000))
    .setFooter({ text: footer });
}
