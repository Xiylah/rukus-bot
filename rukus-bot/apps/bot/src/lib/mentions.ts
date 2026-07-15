import type { Client } from "discord.js";

/**
 * A user mention that stays readable on mobile.
 *
 * A bare <@id> is resolved to a name by the CLIENT, and the mobile app only
 * manages it when it already has that user cached, which it often does not for
 * someone who has left the channel or that this device has never seen. When it
 * cannot, it renders the raw "<@1040460600867831808>", which is what shows up in
 * ticket summaries and app submissions.
 *
 * Discord's own guidance is to not depend on that resolution: pair the mention
 * with a name we resolved ourselves. The mention still pings/links correctly on
 * every client, and the name is always there to read even when the mention is
 * not rendered. So this returns "<@id> (username)".
 *
 * It never throws: a fetch failure (the user deleted their account, left, etc.)
 * falls back to the bare mention, which is no worse than today.
 *
 * NOTE: deliberately NOT used inside the HTML transcript. That file has no
 * Discord client to resolve anything, and the transcript is meant to keep the
 * raw ids on purpose.
 */
export async function mentionWithName(
  client: Client,
  userId: string,
): Promise<string> {
  try {
    const user = await client.users.fetch(userId);
    // globalName is the new display name; username is the @handle fallback.
    const name = user.globalName ?? user.username;
    return `<@${userId}> (${name})`;
  } catch {
    return `<@${userId}>`;
  }
}
