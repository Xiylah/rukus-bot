/**
 * Discord reads the PUBLIC leaderboard needs.
 *
 * Kept out of lib/discord.ts on purpose: everything in there is behind the
 * dashboard's auth guard, and these run for anonymous visitors. They use the
 * BOT token (never a user token) and only ever expose what a member of the
 * server could already see: the server's name, and a name and avatar per row.
 */

const DISCORD_API = "https://discord.com/api/v10";

export interface PublicGuild {
  id: string;
  name: string;
  iconUrl: string | null;
}

export interface MemberIdentity {
  name: string;
  avatarUrl: string;
}

/** Default avatar for a user we could not resolve (left the server, deleted). */
function defaultAvatar(userId: string): string {
  // Discord's new scheme: (id >> 22) % 6 picks one of the six default avatars.
  let index = 0;
  try {
    index = Number((BigInt(userId) >> 22n) % 6n);
  } catch {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function botGet<T>(path: string, revalidate: number): Promise<T | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${token}` },
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** The server's name and icon, or null when the bot is not in it. */
export async function fetchPublicGuild(
  guildId: string,
): Promise<PublicGuild | null> {
  const guild = await botGet<{ id: string; name: string; icon: string | null }>(
    `/guilds/${guildId}`,
    300,
  );
  if (!guild) return null;
  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.icon
      ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
      : null,
  };
}

/**
 * Names and avatars for a set of user ids.
 *
 * Discord has no batch user endpoint, so 100 rows would be 100 sequential REST
 * calls, which is both slow and a fast route to a 429. Instead we pull one page
 * of the guild's member list (a single call, up to 1000 members, cached) and
 * index it. Anyone missing from that page falls back to their id and a default
 * avatar rather than costing an extra request.
 */
export async function fetchMemberIdentities(
  guildId: string,
  userIds: string[],
): Promise<Map<string, MemberIdentity>> {
  type Raw = {
    user?: {
      id: string;
      username: string;
      global_name?: string | null;
      avatar: string | null;
    };
    nick?: string | null;
    avatar?: string | null;
  };

  const members = (await botGet<Raw[]>(`/guilds/${guildId}/members?limit=1000`, 300)) ?? [];

  const byId = new Map<string, Raw>();
  for (const m of members) if (m.user) byId.set(m.user.id, m);

  const out = new Map<string, MemberIdentity>();
  for (const id of userIds) {
    const m = byId.get(id);
    const user = m?.user;
    if (!user) {
      out.set(id, { name: `Unknown (${id})`, avatarUrl: defaultAvatar(id) });
      continue;
    }
    // Per-guild avatars win, then the global one, then the default.
    const avatarUrl = m?.avatar
      ? `https://cdn.discordapp.com/guilds/${guildId}/users/${id}/avatars/${m.avatar}.png?size=64`
      : user.avatar
        ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=64`
        : defaultAvatar(id);
    out.set(id, {
      name: m?.nick || user.global_name || user.username,
      avatarUrl,
    });
  }
  return out;
}
