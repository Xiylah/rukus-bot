import type { ChatInputCommandInteraction, GuildMember, User } from "discord.js";

/**
 * Sanity/hierarchy checks shared by all moderation commands.
 * Returns an error string to show the moderator, or null when the action may
 * proceed. `ability` is discord.js's own can-the-BOT-do-this flag.
 */
export function guardTarget(
  interaction: ChatInputCommandInteraction<"cached">,
  target: User,
  targetMember: GuildMember | null,
  ability: "moderatable" | "kickable" | "bannable",
): string | null {
  if (target.id === interaction.user.id) {
    return "You can't moderate yourself.";
  }
  if (target.id === interaction.client.user.id) {
    return "I refuse to moderate myself.";
  }
  if (target.id === interaction.guild.ownerId) {
    return "You can't moderate the server owner.";
  }
  if (targetMember) {
    const mod = interaction.member;
    if (
      interaction.user.id !== interaction.guild.ownerId &&
      targetMember.roles.highest.position >= mod.roles.highest.position
    ) {
      return "That member's highest role is equal to or above yours.";
    }
    if (!targetMember[ability]) {
      return "I can't act on that member; their highest role is above mine.";
    }
  }
  return null;
}
