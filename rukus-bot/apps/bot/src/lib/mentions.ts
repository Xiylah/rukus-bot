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
 * So we keep the clickable mention AND write the handle next to it:
 * "<@id> (handle)". When the client resolves the mention it shows the normal
 * blue pill and the handle is a mild duplicate; when it cannot, the handle is
 * still there to read instead of a meaningless number. This mirrors the
 * "Users in transcript" list, e.g. "@MOD | XCableGod95 - xcablegod95".
 *
 * The name shown is the global @HANDLE (username), not the per-server nickname,
 * so it is stable and unambiguous.
 *
 * Never throws: if the user cannot be fetched (left the guild AND is uncached,
 * or deleted their account), the bare mention is returned, no worse than today.
 *
 * NOTE: deliberately NOT used inside the HTML transcript, which keeps raw ids on
 * purpose and has no client to resolve anything anyway.
 */
export async function resolvedMention(
  guild: Guild,
  userId: string,
): Promise<string> {
  // The username lives on the User, so the plain user fetch is all we need; it
  // also works for someone who has left the guild but is still a real account.
  const user = await guild.client.users.fetch(userId).catch(() => null);
  return user ? `<@${userId}> (${user.username})` : `<@${userId}>`;
}
