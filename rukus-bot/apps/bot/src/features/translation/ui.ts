import { EmbedBuilder } from "discord.js";
import { COLORS } from "@rukus/shared";

/** Build the standard translation result embed. */
export function translationEmbed(params: {
  translated: string;
  src: string;
  target: string;
  requester?: string;
  /** Guild-configured accent color (#rrggbb). Falls back to the default. */
  color?: string;
}): EmbedBuilder {
  const { translated, src, target, requester, color } = params;
  const srcLabel = src && src !== "auto" ? src.toUpperCase() : "Auto-detected";
  let footer = `${srcLabel} → ${target.toUpperCase()}`;
  if (requester) footer += ` • requested by ${requester}`;
  const accent = color
    ? parseInt(color.replace(/^#/, ""), 16)
    : COLORS.success;
  return new EmbedBuilder()
    .setColor(Number.isFinite(accent) ? accent : COLORS.success)
    .setTitle("🌐 Translation")
    .setDescription(translated.slice(0, 4000))
    .setFooter({ text: footer });
}
