import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAccessConfig } from "@rukus/supabase";
import {
  fetchUserGuilds,
  canManageGuild,
  fetchMemberRoleIds,
  DiscordApiError,
  type DiscordGuild,
} from "./discord";

/**
 * Fetch the user's guilds, translating an expired/revoked Discord token
 * (401) into a clean re-login instead of a server-error page. The Auth.js
 * session can outlive the ~7-day Discord access token, so this WILL happen
 * to long-lived logins.
 */
async function userGuildsOrRelogin(accessToken: string) {
  try {
    return await fetchUserGuilds(accessToken);
  } catch (err) {
    if (err instanceof DiscordApiError && err.status === 401) {
      redirect("/login?expired=1");
    }
    throw err;
  }
}

/**
 * Server-side guard for dashboard routes. This is the security boundary - the
 * data helpers trust that the caller has passed through here.
 *
 * Access to a guild is granted when ANY of these is true:
 *   1. the user has Manage Server on that guild (Discord permission), OR
 *   2. the user holds one of the guild's configured dashboard staff roles, OR
 *   3. the user is on the guild's explicit allow-list.
 *
 * (1) is read from the OAuth `guilds` scope; (2)/(3) are read from the guild's
 * access config, with the user's roles fetched via the bot token.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.discordId || !session.accessToken) {
    redirect("/login");
  }
  return session;
}

/** All guilds the user is in (raw), plus which ones they can manage by perm. */
export async function requireUserGuilds() {
  const session = await requireSession();
  const guilds = await userGuildsOrRelogin(session.accessToken!);
  return { session, guilds };
}

/**
 * Determine whether the signed-in user may access a specific guild's dashboard.
 * Returns the guild object (from the user's guild list) when allowed.
 */
export async function requireGuildAccess(guildId: string) {
  const session = await requireSession();
  const guilds = await userGuildsOrRelogin(session.accessToken!);
  const guild = guilds.find((g) => g.id === guildId);

  // The user must at least be a member of the guild.
  if (!guild) redirect("/dashboard");

  // Path 1: Manage Server permission - always allowed.
  if (canManageGuild(guild)) return { session, guild };

  // Paths 2 & 3: staff role or allow-list from the guild's access config.
  const access = await getAccessConfig(guildId);
  const userId = session.discordId!;
  if (access.allowUserIds.includes(userId)) return { session, guild };

  if (access.staffRoleIds.length > 0) {
    const roleIds = await fetchMemberRoleIds(guildId, userId);
    if (roleIds.some((r) => access.staffRoleIds.includes(r))) {
      return { session, guild };
    }
  }

  redirect("/dashboard");
}

/**
 * Guilds to show on the dashboard home.
 *
 * A user sees a guild when they can manage it by permission, OR when that
 * guild's own access config grants them entry (staff role / allow-list). The
 * staff-role path used to be hard-wired to one configured guild; the bot is
 * public now, so it has to work for whichever guilds this user actually has a
 * staff role in.
 *
 * Only guilds the BOT is in are worth showing: the dashboard cannot configure a
 * server the bot has not joined, and offering it just produces a dead page. That
 * check is the caller's (it needs the bot's guild list), so this returns the
 * candidates and lets the page filter.
 */
export async function requireManageableGuilds() {
  const { session, guilds } = await requireUserGuilds();
  const byPermission = guilds.filter(canManageGuild);
  const discordId = session.discordId!;

  // Guilds the user is in but cannot manage: they may still be staff there.
  const managed = new Set(byPermission.map((g) => g.id));
  const candidates = guilds.filter((g) => !managed.has(g.id));

  // Check each in parallel, but only the ones that actually configured staff
  // access. A guild with no access config costs one cheap read and no Discord
  // call, so this stays bounded by how many guilds the user shares with the bot.
  const extra = await Promise.all(
    candidates.map(async (g): Promise<DiscordGuild | null> => {
      try {
        const access = await getAccessConfig(g.id);
        if (access.allowUserIds.includes(discordId)) return g;
        if (access.staffRoleIds.length === 0) return null;

        const roleIds = await fetchMemberRoleIds(g.id, discordId);
        return roleIds.some((r) => access.staffRoleIds.includes(r)) ? g : null;
      } catch {
        // The bot is probably not in that guild (so it cannot read members).
        // Not an error: it just means no staff access to grant.
        return null;
      }
    }),
  );

  return {
    session,
    guilds: [...byPermission, ...extra.filter((g): g is DiscordGuild => g !== null)],
  };
}
