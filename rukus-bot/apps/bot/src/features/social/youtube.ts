import { blocks, tagAttr, tagText } from "./xml.js";
import { fetchWithTimeout, type SocialItem } from "./types.js";

/**
 * YouTube upload alerts, with NO API key.
 *
 * Every channel publishes an Atom feed at
 *   https://www.youtube.com/feeds/videos.xml?channel_id=UC...
 * which carries the last ~15 uploads. That is far more than a 5-minute poll
 * needs and it costs no quota, so the Data API (key, project, quota limits) buys
 * us nothing here.
 *
 * The catch is that the feed is keyed by CHANNEL ID, and almost nobody knows
 * their own: people paste a URL. So we accept a URL and dig the id out.
 */

const FEED_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=";

/** True for a canonical YouTube channel id (always "UC" + 22 chars). */
export function isChannelId(value: string): boolean {
  return /^UC[\w-]{22}$/.test(value.trim());
}

/**
 * Pull a channel id out of whatever the user pasted.
 *
 * Handles the raw id, /channel/UC... URLs, and the handle/custom-URL forms
 * (@name, /c/name, /user/name). The handle forms carry no id, so we fetch the
 * page and read the id out of its markup: YouTube embeds it in several places
 * (canonical link, externalId, channelId meta) and any of them will do.
 *
 * Returns null when the source is unusable, which the poller treats as a
 * skip-with-a-log rather than an error.
 */
export async function resolveChannelId(source: string): Promise<string | null> {
  const value = source.trim();
  if (isChannelId(value)) return value;

  const inUrl = /(?:youtube\.com\/channel\/)(UC[\w-]{22})/.exec(value);
  if (inUrl) return inUrl[1]!;

  // A handle or custom URL. Normalise to a page we can scrape.
  let pageUrl: string;
  if (/^https?:\/\//i.test(value)) {
    pageUrl = value;
  } else if (value.startsWith("@")) {
    pageUrl = `https://www.youtube.com/${value}`;
  } else {
    return null;
  }

  const res = await fetchWithTimeout(pageUrl).catch(() => null);
  if (!res?.ok) return null;
  const html = await res.text().catch(() => "");

  const found =
    /"externalId"\s*:\s*"(UC[\w-]{22})"/.exec(html) ??
    /<meta itemprop="(?:identifier|channelId)" content="(UC[\w-]{22})"/.exec(html) ??
    /channel\/(UC[\w-]{22})/.exec(html);
  return found?.[1] ?? null;
}

/** Newest upload for a channel, or null if the feed is empty/unreachable. */
export async function latestVideo(channelId: string): Promise<SocialItem | null> {
  const res = await fetchWithTimeout(FEED_URL + encodeURIComponent(channelId));
  if (!res.ok) throw new Error(`YouTube feed ${res.status} for ${channelId}`);

  const xml = await res.text();
  // Atom orders entries newest-first, so the first one is the latest upload.
  const entry = blocks(xml, "entry")[0];
  if (!entry) return null;

  const videoId = tagText(entry, "yt:videoId");
  if (!videoId) return null;

  // The <author><name> inside the entry is the uploader; the feed-level one is
  // the same channel, so either works. Take the entry's to stay self-contained.
  const author = tagText(blocks(entry, "author")[0] ?? "", "name");

  return {
    id: videoId,
    title: tagText(entry, "title") || "New video",
    link: `https://www.youtube.com/watch?v=${videoId}`,
    author: author || undefined,
    thumbnail: tagAttr(entry, "media:thumbnail", "url") || undefined,
  };
}
