import {
  EmbedBuilder,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
  type MessageCreateOptions,
} from "discord.js";
import { getSocialAlertsConfig, setSocialAlertsConfig } from "@rukus/db";
import type { SocialAlertsConfig, SocialFeed } from "@rukus/shared";
import { invalidate } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import type { SocialItem } from "./types.js";
import { latestVideo, resolveChannelId } from "./youtube.js";
import { currentStream, twitchConfigured, warnIfUnconfigured } from "./twitch.js";
import { latestItem } from "./rss.js";

/**
 * Social alerts: one 5-minute sweep over every guild's feeds.
 *
 * Deliberately ONE interval for the whole bot (same shape as the ticket
 * auto-close sweeper). A timer per feed would be N-timers-per-guild on a public
 * bot, which is a leak waiting to happen and gives no benefit: 5 minutes is
 * already far tighter than any of these platforms update.
 *
 * Dedupe is `feed.lastItemId`, persisted back into the guild's config after each
 * announcement. The subtle part is the FIRST poll of a new feed: at that moment
 * lastItemId is "", and the newest item is almost certainly old. Announcing it
 * would spam a channel with a backlog nobody asked for, so a first poll silently
 * records the id and posts nothing. Every later poll compares against it.
 */

const POLL_INTERVAL_MS = 5 * 60_000;
/** Wait for the guild cache to settle before the first sweep. */
const FIRST_POLL_DELAY_MS = 30_000;

/** Guard against two sweeps overlapping if one runs long (slow/dead feed hosts). */
let sweeping = false;

// ---------------- Templating ----------------

/**
 * Mention policy for every feed announcement.
 *
 * A feed's message template is author-controlled (any staffer with dashboard or
 * /social access writes it), and the {everyone}/{here}/{role} placeholders expand
 * to literal ping text. Discord will only turn that text into a real ping if the
 * message's allowedMentions permits it, so we compute the permission from what
 * the rendered message ACTUALLY contains rather than allowing a blanket set.
 *
 * The result: a template that never says {everyone} can never mass-ping, even if
 * someone pastes a raw "@everyone" into it, and a role ping is limited to the one
 * role the feed configured. Same discipline as SAFE_MENTIONS in features/custom.
 */
function mentionPolicy(
  template: string,
  roleId: string | undefined,
): MessageCreateOptions["allowedMentions"] {
  const parse: ("everyone" | "roles" | "users")[] = [];
  // "everyone" covers @here too, as far as Discord's parse list is concerned.
  if (/\{everyone\}/i.test(template) || /\{here\}/i.test(template)) {
    parse.push("everyone");
  }
  // Roles are allow-listed by id, so {role} can only ever ping the configured
  // one. A raw <@&...> pasted into the template stays inert text.
  const roles = /\{role\}/i.test(template) && roleId ? [roleId] : [];
  return { parse, roles, users: [] };
}

/** Fill a feed's message template. Unknown placeholders are left alone. */
export function renderTemplate(
  template: string,
  vars: { name: string; link: string; title: string; roleId?: string },
): string {
  return template
    .replace(/\{name\}/gi, vars.name)
    .replace(/\{link\}/gi, vars.link)
    .replace(/\{title\}/gi, vars.title)
    .replace(/\{everyone\}/gi, "@everyone")
    .replace(/\{here\}/gi, "@here")
    .replace(/\{role\}/gi, vars.roleId ? `<@&${vars.roleId}>` : "")
    .trim();
}

function hexToInt(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(n) ? 0x5865f2 : n;
}

const TYPE_LABEL: Record<SocialFeed["type"], string> = {
  youtube: "New video on YouTube",
  twitch: "Live on Twitch",
  rss: "New post",
};

/** Build the exact payload the feed will post. Shared by the poller and /social test. */
export function buildAnnouncement(
  feed: SocialFeed,
  item: SocialItem,
): MessageCreateOptions {
  const name = item.author || feed.displayName;
  const content = renderTemplate(feed.message, {
    name,
    link: item.link,
    title: item.title,
    roleId: feed.mentionRoleId,
  });

  const embed = new EmbedBuilder()
    .setColor(hexToInt(feed.embedColor))
    .setAuthor({ name: `${name} - ${TYPE_LABEL[feed.type]}` })
    .setTitle(item.title.slice(0, 256) || TYPE_LABEL[feed.type])
    .setURL(item.link || null)
    .setTimestamp(new Date());

  if (item.description) embed.setDescription(item.description.slice(0, 2000));
  if (item.thumbnail) embed.setImage(item.thumbnail);

  return {
    // A template that renders to nothing (all placeholders, no role set) would
    // make Discord reject the send, so fall back to the bare link.
    content: content || item.link || undefined,
    embeds: [embed],
    allowedMentions: mentionPolicy(feed.message, feed.mentionRoleId),
  };
}

// ---------------- Fetching ----------------

/** Ask the right provider for a feed's newest item. Throws on a transport error. */
export async function fetchLatest(feed: SocialFeed): Promise<SocialItem | null> {
  if (feed.type === "youtube") {
    const channelId = await resolveChannelId(feed.source);
    if (!channelId) {
      throw new Error(
        `could not work out a YouTube channel id from "${feed.source}"`,
      );
    }
    return latestVideo(channelId);
  }
  if (feed.type === "twitch") {
    if (!twitchConfigured()) return null;
    return currentStream(feed.source);
  }
  return latestItem(feed.source);
}

// ---------------- Live roles ----------------

/**
 * Twitch only: mirror live status onto a role.
 *
 * The role goes on whoever the streamer is IN THIS GUILD, which we can only know
 * if their Discord account is linked... which we cannot see. So the role is
 * applied to guild members whose display name matches the feed's displayName or
 * source login. That is the pragmatic approach every free bot takes, and it is
 * why the dashboard describes this as "the member who streams".
 *
 * A miss is silent: a live alert that posts but cannot find the member is still
 * a working alert.
 */
async function syncLiveRole(
  guild: Guild,
  feed: SocialFeed,
  live: boolean,
): Promise<void> {
  if (!feed.liveRoleId) return;
  const role = await guild.roles.fetch(feed.liveRoleId).catch(() => null);
  if (!role) return;

  // The bot cannot manage a role at or above its own highest role.
  const me = guild.members.me;
  if (!me || role.position >= me.roles.highest.position) {
    log.warn(
      `Live role @${role.name} in ${guild.name} is above the bot's highest role - cannot apply it.`,
    );
    return;
  }

  const wanted = [feed.displayName.toLowerCase(), feed.source.trim().toLowerCase()];
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return;

  const streamer = members.find(
    (m) =>
      wanted.includes(m.displayName.toLowerCase()) ||
      wanted.includes(m.user.username.toLowerCase()),
  );
  if (!streamer) return;

  const has = streamer.roles.cache.has(role.id);
  if (live && !has) {
    await streamer.roles.add(role, "Twitch stream went live").catch(() => {});
  } else if (!live && has) {
    await streamer.roles.remove(role, "Twitch stream ended").catch(() => {});
  }
}

// ---------------- The sweep ----------------

/**
 * Poll one feed and post if there is something new.
 *
 * Returns the id to persist as lastItemId, or null to leave it untouched. The
 * caller batches those writes so a guild with ten feeds does one config write,
 * not ten.
 */
async function pollFeed(
  guild: Guild,
  feed: SocialFeed,
): Promise<string | null> {
  const item = await fetchLatest(feed);
  if (!item) return null;

  // "" means we have never successfully polled this feed.
  const isFirstPoll = feed.lastItemId === "";

  if (feed.type === "twitch") {
    const live = item.live === true;
    await syncLiveRole(guild, feed, live);

    // Offline. Record the offline marker (item.id is "offline:<login>") rather
    // than clearing lastItemId back to "": an empty string would read as "never
    // polled" on the next tick, and the feed would silently baseline the stream
    // instead of announcing it. Never announce an offline state either way.
    if (!live) return item.id === feed.lastItemId ? null : item.id;
  }

  if (item.id === feed.lastItemId) return null;

  // Brand new feed: adopt the current item as the baseline and stay quiet, so
  // adding a channel with 200 old videos does not dump 200 announcements.
  if (isFirstPoll) {
    log.info(
      `Social: baselined new ${feed.type} feed "${feed.displayName}" in ${guild.name} (nothing posted).`,
    );
    return item.id;
  }

  if (!feed.postChannelId) return item.id;
  const channel = await guild.channels
    .fetch(feed.postChannelId)
    .catch(() => null);
  if (!channel?.isTextBased()) return item.id;

  await (channel as GuildTextBasedChannel).send(buildAnnouncement(feed, item));
  log.info(
    `Social: announced ${feed.type} "${item.title}" for "${feed.displayName}" in ${guild.name}.`,
  );
  return item.id;
}

/** One pass over every enabled feed in every guild. */
export async function sweepSocialFeeds(client: Client): Promise<void> {
  if (sweeping) {
    log.warn("Social: previous sweep still running, skipping this tick.");
    return;
  }
  sweeping = true;

  try {
    for (const guild of client.guilds.cache.values()) {
      let config: SocialAlertsConfig;
      try {
        config = await getSocialAlertsConfig(guild.id);
      } catch (err) {
        log.error(`Social: config read failed for guild ${guild.id}:`, err);
        continue;
      }
      if (!config.enabled || config.feeds.length === 0) continue;

      if (config.feeds.some((f) => f.enabled && f.type === "twitch")) {
        warnIfUnconfigured();
      }

      // id -> new lastItemId, applied in one write at the end of the guild.
      const updates = new Map<string, string>();

      for (const feed of config.feeds) {
        if (!feed.enabled) continue;
        try {
          const newId = await pollFeed(guild, feed);
          if (newId !== null && newId !== feed.lastItemId) {
            updates.set(feed.id, newId);
          }
        } catch (err) {
          // One broken feed (dead URL, typo'd source, rate limit) must never
          // stop the others, in this guild or any other.
          log.warn(
            `Social: feed "${feed.displayName}" (${feed.type}) in ${guild.name} failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      if (updates.size === 0) continue;

      try {
        // Re-read before writing: the sweep can take a while and a staffer may
        // have edited the feeds through the dashboard in the meantime. Merging
        // into the FRESH config means we only ever overwrite lastItemId, never
        // clobber their edit.
        const fresh = await getSocialAlertsConfig(guild.id);
        await setSocialAlertsConfig(guild.id, {
          ...fresh,
          feeds: fresh.feeds.map((f) =>
            updates.has(f.id) ? { ...f, lastItemId: updates.get(f.id)! } : f,
          ),
        });
        invalidate(guild.id);
      } catch (err) {
        // Losing the write means the next tick re-announces. Noisy, not fatal.
        log.error(`Social: failed to persist feed state for ${guild.name}:`, err);
      }
    }
  } finally {
    sweeping = false;
  }
}

/** Start the recurring social-alerts poll. */
export function startSocialPoller(client: Client): void {
  setTimeout(() => void sweepSocialFeeds(client), FIRST_POLL_DELAY_MS);
  setInterval(() => void sweepSocialFeeds(client), POLL_INTERVAL_MS);
  log.info("Social alerts poller started (every 5 min).");
}
