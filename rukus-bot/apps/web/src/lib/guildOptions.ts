import {
  fetchGuildChannels,
  fetchGuildRoles,
  textChannels,
  categoryChannels,
} from "./discord";
import type { Option } from "@/components/Pickers";

/**
 * Convert Discord's integer role color to CSS (0 = "no color").
 * Defined here, NOT in Pickers.tsx: that file is "use client", and calling a
 * client-module function from server code is a runtime error in production
 * ("Attempted to call roleColor() from the server").
 */
function roleColor(color: number): string | undefined {
  if (!color) return undefined;
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Load a guild's channels and roles as ready-to-render dropdown options.
 *
 * Called from each settings page. Next dedupes and caches the underlying fetches
 * (see the `revalidate` in lib/discord.ts), so several pages calling this in one
 * request doesn't mean several Discord API round-trips.
 */
export async function loadGuildOptions(guildId: string): Promise<{
  categories: Option[];
  channels: Option[];
  roles: Option[];
}> {
  const [allChannels, allRoles] = await Promise.all([
    fetchGuildChannels(guildId),
    fetchGuildRoles(guildId),
  ]);

  return {
    categories: categoryChannels(allChannels).map((c) => ({
      id: c.id,
      name: c.name,
    })),
    channels: textChannels(allChannels).map((c) => ({
      id: c.id,
      name: c.name,
    })),
    roles: allRoles.map((r) => ({
      id: r.id,
      name: r.name,
      color: roleColor(r.color),
    })),
  };
}
