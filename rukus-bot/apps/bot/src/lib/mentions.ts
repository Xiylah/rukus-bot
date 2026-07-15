import type { Guild } from "discord.js";

/**
 * A user mention that stays readable on mobile.
 *
 * A bare <@id> is turned into a name by the VIEWER'S client, and only when that
 * client already has the user cached. Your own screenshot shows the proof: in a
 * single embed, active staff resolved to "@Name" while the ticket owner, who had
 * left the channel, rendered as the raw "<@1040460600867831808>". The bot cannot
 * fix the viewer's cache from its side, so a bare mention can always fall back
 * to an id on someone's phone.
 *
 * So we keep the clickable mention AND write the name next to it: "<@id> (name)".
 * When the client can resolve the mention it shows the normal blue pill and the
 * parenthetical is a mild duplicate; when it cannot, the name is still right
 * there to read instead of a meaningless number.
 *
 * The name is the GUILD nickname where they have one ("MOD | XCableGod95"),
 * falling back to their display name then their handle, so it matches what
 * everyone sees in that server.
 *
 * Never throws: if the member cannot be fetched (left the guild, deleted
 * account), the bare mention is returned, which is no worse than today.
 *
 * NOTE: deliberately NOT used inside the HTML transcript, which keeps raw ids on
 * purpose and has no client to resolve anything anyway.
 */
export async function resolvedMention(
  guild: Guild,
  userId: string,
): Promise<string> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    // displayName is already nickname -> global name -> handle, i.e. exactly the
    // name the rest of the server sees.
    return `<@${userId}> (${member.displayName})`;
  }

  // Left the guild: no nickname to show, but a global name still beats a number.
  const user = await guild.client.users.fetch(userId).catch(() => null);
  const name = user?.globalName ?? user?.username;
  return name ? `<@${userId}> (${name})` : `<@${userId}>`;
}
