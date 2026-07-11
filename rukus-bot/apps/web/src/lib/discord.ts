/**
 * Thin Discord REST helpers used by the dashboard to figure out which guilds
 * the logged-in user may manage. We never store these results long-term; they
 * gate access at request time.
 */

const DISCORD_API = "https://discord.com/api/v10";

// Discord permission bits.
const MANAGE_GUILD = 0x20n; // 1 << 5
const ADMINISTRATOR = 0x8n; // 1 << 3

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string; // stringified bitfield
}

/** Discord channel types we care about (numeric, per the API). */
export const CHANNEL_TYPE = {
  text: 0,
  voice: 2,
  category: 4,
  announcement: 5,
  forum: 15,
} as const;

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  position: number;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean; // true for bot/integration roles
}

/** Error that carries the Discord HTTP status so callers can react to it. */
export class DiscordApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * In-process cache for each user's guild list, keyed by their access token.
 *
 * /users/@me/guilds is one of Discord's most tightly rate-limited endpoints,
 * and the auth guard needs it on every page render (layout + page = several
 * calls per click). Without this cache, clicking around the dashboard quickly
 * produces 429s and an error page. Next's fetch cache can't be trusted with
 * per-user Authorization headers, so we cache explicitly:
 *   - fresh for 60s per user,
 *   - on 429/5xx we serve the stale list rather than crash the page.
 */
const guildListCache = new Map<
  string,
  { data: DiscordGuild[]; expires: number }
>();
const GUILDS_TTL_MS = 60_000;
const GUILDS_CACHE_MAX = 500;

/** Fetch the guilds the user is in, using their OAuth access token. */
export async function fetchUserGuilds(
  accessToken: string,
): Promise<DiscordGuild[]> {
  const now = Date.now();
  const hit = guildListCache.get(accessToken);
  if (hit && hit.expires > now) return hit.data;

  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    // Rate limited or Discord hiccup: a stale guild list beats an error page.
    if (hit && (res.status === 429 || res.status >= 500)) return hit.data;
    throw new DiscordApiError(
      res.status,
      `Discord /users/@me/guilds failed: ${res.status}`,
    );
  }

  const data = (await res.json()) as DiscordGuild[];
  guildListCache.set(accessToken, { data, expires: now + GUILDS_TTL_MS });
  while (guildListCache.size > GUILDS_CACHE_MAX) {
    const oldest = guildListCache.keys().next().value;
    if (oldest === undefined) break;
    guildListCache.delete(oldest);
  }
  return data;
}

/** True if the user owns the guild or has the Manage Server permission. */
export function canManageGuild(guild: DiscordGuild): boolean {
  if (guild.owner) return true;
  try {
    const perms = BigInt(guild.permissions);
    // Administrator implies every permission, including Manage Server.
    if ((perms & ADMINISTRATOR) === ADMINISTRATOR) return true;
    return (perms & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

/**
 * True if the user owns the guild or has Administrator.
 *
 * Stricter than canManageGuild - used to gate the Access page, since granting
 * dashboard access is effectively granting power over every other setting.
 */
export function isGuildAdmin(guild: DiscordGuild): boolean {
  if (guild.owner) return true;
  try {
    return (BigInt(guild.permissions) & ADMINISTRATOR) === ADMINISTRATOR;
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
 * member. This is a plain REST call - edge-compatible (no bot process needed).
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

/** GET a guild sub-resource with the bot token. Returns [] on any failure. */
async function botGet<T>(path: string, revalidate = 60): Promise<T[]> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${token}` },
      // Channels/roles change rarely; cache briefly to stay well inside
      // Discord's rate limits while keeping the dashboard responsive.
      next: { revalidate },
    });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

/**
 * Every channel in the guild, sorted for display.
 *
 * Used to populate the dashboard's channel/category dropdowns, so admins pick
 * from a real list instead of pasting snowflake IDs.
 */
export async function fetchGuildChannels(
  guildId: string,
): Promise<DiscordChannel[]> {
  const channels = await botGet<DiscordChannel>(`/guilds/${guildId}/channels`);
  return channels.sort((a, b) => a.position - b.position);
}

/** Text-ish channels the bot can post in (text, announcement). */
export function textChannels(channels: DiscordChannel[]): DiscordChannel[] {
  return channels.filter(
    (c) => c.type === CHANNEL_TYPE.text || c.type === CHANNEL_TYPE.announcement,
  );
}

/** Category channels (used as the parent for new ticket channels). */
export function categoryChannels(channels: DiscordChannel[]): DiscordChannel[] {
  return channels.filter((c) => c.type === CHANNEL_TYPE.category);
}

/**
 * Every role in the guild, highest first, excluding @everyone.
 *
 * Managed (bot/integration) roles ARE included: permission pickers like ticket
 * support roles legitimately need them, e.g. adding the bot's own role so it
 * can read ticket channels. They get a "(bot)" suffix so they're identifiable.
 * Callers that assign roles to members (auto-roles, form approval) should use
 * assignableRoles() instead, since Discord refuses to grant managed roles.
 */
export async function fetchGuildRoles(guildId: string): Promise<DiscordRole[]> {
  const roles = await botGet<DiscordRole>(`/guilds/${guildId}/roles`);
  return roles
    .filter((r) => r.id !== guildId) // @everyone shares the guild id
    .sort((a, b) => b.position - a.position)
    .map((r) => (r.managed ? { ...r, name: `${r.name} (bot)` } : r));
}

/** Roles a bot can actually grant to members (excludes managed ones). */
export function assignableRoles(roles: DiscordRole[]): DiscordRole[] {
  return roles.filter((r) => !r.managed);
}

export interface DiscordMember {
  id: string;
  name: string; // nickname, else display name, else username
}

/**
 * Guild members, for the Access page's user allow-list picker.
 *
 * Discord caps this endpoint at 1000 per call and it needs the Guild Members
 * intent (which the bot has). We fetch a single page - ample for picking staff,
 * and it avoids paginating thousands of members just to fill a dropdown.
 */
export async function fetchGuildMembers(
  guildId: string,
): Promise<DiscordMember[]> {
  type Raw = {
    user?: { id: string; username: string; global_name?: string | null; bot?: boolean };
    nick?: string | null;
  };
  const raw = await botGet<Raw>(`/guilds/${guildId}/members?limit=1000`, 120);
  return raw
    .filter((m) => m.user && !m.user.bot)
    .map((m) => ({
      id: m.user!.id,
      name: m.nick || m.user!.global_name || m.user!.username,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
