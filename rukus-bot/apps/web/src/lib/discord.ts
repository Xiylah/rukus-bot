/**
 * Thin Discord REST helpers used by the dashboard to figure out which guilds
 * the logged-in user may manage. We never store these results long-term; they
 * gate access at request time.
 */

const DISCORD_API = "https://discord.com/api/v10";

// Discord permission bit for MANAGE_GUILD (0x20 = 1 << 5).
const MANAGE_GUILD = 0x20n;

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string; // stringified bitfield
}

/** Fetch the guilds the user is in, using their OAuth access token. */
export async function fetchUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Guilds change rarely within a session; cache briefly to dodge rate limits.
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`Discord /users/@me/guilds failed: ${res.status}`);
  }
  return (await res.json()) as DiscordGuild[];
}

/** True if the user owns the guild or has the Manage Server permission. */
export function canManageGuild(guild: DiscordGuild): boolean {
  if (guild.owner) return true;
  try {
    return (BigInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

/** Guild icon URL (or null for the fallback initial avatar). */
export function guildIconUrl(guild: DiscordGuild, size = 64): string | null {
  if (!guild.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=${size}`;
}

/**
 * Fetch a member's role IDs in a guild using the BOT token.
 *
 * OAuth's `guilds` scope gives us the user's permissions but NOT their roles,
 * so to gate access by specific staff roles we ask Discord directly with the
 * bot's token. Returns [] if the bot isn't in the guild or the user isn't a
 * member. This is a plain REST call — edge-compatible (no bot process needed).
 */
export async function fetchMemberRoleIds(
  guildId: string,
  userId: string,
): Promise<string[]> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return [];
  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/${userId}`,
    {
      headers: { Authorization: `Bot ${token}` },
      next: { revalidate: 15 },
    },
  );
  if (!res.ok) return []; // 404 = not a member, 403 = bot lacks access
  const member = (await res.json()) as { roles?: string[] };
  return member.roles ?? [];
}
