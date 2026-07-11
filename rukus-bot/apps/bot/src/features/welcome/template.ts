import type { GuildMember, PartialGuildMember } from "discord.js";

/**
 * Fill a welcome/leave message template.
 *   {user}        mention (falls back to the name in leave messages)
 *   {username}    display name, no ping
 *   {server}      guild name
 *   {memberCount} current member count
 */
export function renderTemplate(
  template: string,
  member: GuildMember | PartialGuildMember,
  opts: { noMention?: boolean } = {},
): string {
  const name = member.user?.displayName ?? member.user?.username ?? "someone";
  return template
    .replace(/\{user\}/gi, opts.noMention ? name : `<@${member.id}>`)
    .replace(/\{username\}/gi, name)
    .replace(/\{server\}/gi, member.guild.name)
    .replace(/\{memberCount\}/gi, String(member.guild.memberCount));
}
