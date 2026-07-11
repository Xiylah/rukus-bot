import type { GuildMember } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

/** True if the member holds any of the given role ids, or is an admin. */
export function hasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return roleIds.some((id) => member.roles.cache.has(id));
}

/** True if the member can manage the guild (dashboard + panel authority). */
export function canManageGuild(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}
