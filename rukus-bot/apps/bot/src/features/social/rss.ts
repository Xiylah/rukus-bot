import { blocks, stripHtml, tagAttr, tagText } from "./xml.js";
import { fetchWithTimeout, type SocialItem } from "./types.js";

/**
 * Generic RSS 2.0 and Atom feeds (blogs, news, patch notes, subreddits...).
 *
 * The two formats disagree on every element name, so each is read separately and
 * flattened into the same SocialItem. RSS is checked first because it is what
 * most of the web still emits.
 */

/** Best available unique id for an item, in descending order of trust. */
function itemId(item: string, link: string, title: string): string {
  return (
    tagText(item, "guid") ||
    tagText(item, "id") ||
    link ||
    // Last resort: the title. Weak (a retitled post re-announces), but a feed
    // with no guid, no id and no link has given us nothing better to key on.
    title
  );
}

function parseRss(xml: string): SocialItem | null {
  // RSS orders newest-first by convention, and in practice always does.
  const item = blocks(xml, "item")[0];
  if (!item) return null;

  const link = tagText(item, "link");
  const title = tagText(item, "title") || "New post";
  const id = itemId(item, link, title);
  if (!id) return null;

  const raw = tagText(item, "description") || tagText(item, "content:encoded");

  return {
    id,
    title,
    link,
    author: tagText(item, "dc:creator") || tagText(item, "author") || undefined,
    thumbnail:
      tagAttr(item, "media:thumbnail", "url") ||
      tagAttr(item, "media:content", "url") ||
      tagAttr(item, "enclosure", "url") ||
      undefined,
    description: raw ? stripHtml(raw).slice(0, 400) : undefined,
  };
}

function parseAtom(xml: string): SocialItem | null {
  const entry = blocks(xml, "entry")[0];
  if (!entry) return null;

  // Atom puts the URL in an attribute, not in the element's text.
  const link = tagAttr(entry, "link", "href") || tagText(entry, "link");
  const title = tagText(entry, "title") || "New post";
  const id = itemId(entry, link, title);
  if (!id) return null;

  const raw = tagText(entry, "content") || tagText(entry, "summary");

  return {
    id,
    title,
    link,
    author: tagText(blocks(entry, "author")[0] ?? "", "name") || undefined,
    thumbnail: tagAttr(entry, "media:thumbnail", "url") || undefined,
    description: raw ? stripHtml(raw).slice(0, 400) : undefined,
  };
}

/** Newest item from an RSS or Atom feed URL, or null when it has none. */
export async function latestItem(url: string): Promise<SocialItem | null> {
  const source = url.trim();
  if (!/^https?:\/\//i.test(source)) {
    throw new Error("RSS source must be a full http(s) feed URL");
  }

  const res = await fetchWithTimeout(source, {
    headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
  });
  if (!res.ok) throw new Error(`RSS feed ${res.status} for ${source}`);

  const xml = await res.text();
  return parseRss(xml) ?? parseAtom(xml);
}
