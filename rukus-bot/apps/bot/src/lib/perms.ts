import type { GuildMember } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

/** True if the member holds any of the given role ids, or is an admin. */
export function hasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return roleIds.some((id) => member.roles.cache.has(id));
}

/** True if the member can manage the guild (changes server configuration). */
export function canManageGuild(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

/**
 * True if the member may post one of the bot's panels into a channel.
 *
 * Deliberately Manage Messages, NOT Manage Server: posting a ticket, form,
 * self-role or verification panel writes ONE message into a channel and changes
 * no server setting, so demanding Manage Server asks for far more authority
 * than the action uses. (top.gg rejected the listing over exactly this on
 * /ticket panel.) Building the panel still requires Manage Server, since that
 * edits configuration; only publishing an already-configured panel is allowed
 * here. Administrator implies Manage Messages, so owners are unaffected.
 */
export function canPostPanel(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageMessages);
}
