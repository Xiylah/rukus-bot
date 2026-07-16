import { Events, type Guild } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import { dropGuild } from "../features/invites/cache.js";

/**
 * The bot was removed from a server (kicked, banned, or the guild was deleted).
 *
 * Release the per-guild in-memory state so it does not accumulate for the
 * lifetime of the process. On a public bot the guild list churns constantly, so
 * without this the invite cache leaks a little more every time we leave a
 * server. The database rows are left intact on purpose: if the bot is re-added,
 * its old config is still there, and a re-add is common (a permissions mishap,
 * a re-invite). Cleaning up abandoned rows is a separate, deliberate job, not
 * something to do on every kick.
 */
const handler: EventHandler<Events.GuildDelete> = {
  name: Events.GuildDelete,
  execute: async (guild: Guild) => {
    // `guild` can be a partial (unavailable) during an outage; in that case
    // Discord will fire this again when it resolves, so ignore the partial to
    // avoid dropping caches for a guild we have not actually left.
    if (guild.available === false) return;

    log.info(`Removed from guild ${guild.name ?? guild.id} (${guild.id}).`);
    dropGuild(guild.id);
  },
};

export default handler;
