/**
 * The one shape every provider (youtube, twitch, rss) reduces its source to.
 *
 * The poller does not care what a "new item" means to a given platform: a video
 * upload, a stream going live, and a blog post all become the same struct, which
 * is what lets dedupe, templating, and posting live in exactly one place.
 */
export interface SocialItem {
  /** Stable, platform-unique id. The dedupe key against feed.lastItemId. */
  id: string;
  title: string;
  link: string;
  /** Creator/channel/site name, falls back to the feed's displayName. */
  author?: string;
  thumbnail?: string;
  description?: string;
  /**
   * Twitch only: whether the streamer is live right now. YouTube and RSS have no
   * "offline" concept, so they leave it undefined and the live-role logic is
   * simply skipped for them.
   */
  live?: boolean;
}

/** How long we let any single feed request hang before giving up. */
export const FETCH_TIMEOUT_MS = 10_000;

/** A GET with a timeout, so one dead host cannot stall the whole poll. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "user-agent": "RukusBot/1.0 (social alerts)", ...init.headers },
    });
  } finally {
    clearTimeout(timer);
  }
}
