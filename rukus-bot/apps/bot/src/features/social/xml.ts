/**
 * A deliberately tiny XML reader for RSS/Atom feeds.
 *
 * A full parser (fast-xml-parser and friends) is a dependency we do not need:
 * feed documents are shallow, we only ever want a handful of leaf values out of
 * each <item>/<entry>, and everything downstream is a string anyway. Keeping it
 * in-repo means no new install to race with other agents and nothing to audit.
 *
 * This is NOT a general XML parser and must never be pointed at untrusted markup
 * expecting correctness. It is a pragmatic scraper for well-formed feeds.
 */

/** Strip CDATA wrappers and decode the five XML entities plus numeric escapes. */
export function decodeXml(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand last, or "&amp;lt;" would decode twice into a real "<".
    .replace(/&amp;/g, "&")
    .trim();
}

/** Every `<tag ...>...</tag>` block in `xml`, inner text included. */
export function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  for (const m of xml.matchAll(re)) out.push(m[1] ?? "");
  return out;
}

/** The first `<tag>`'s decoded text, or "" when the tag is absent. */
export function tagText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(xml);
  return m ? decodeXml(m[1] ?? "") : "";
}

/** The value of an attribute on the first `<tag ...>`, or "". */
export function tagAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}\\s[^>]*${attr}=["']([^"']*)["']`, "i");
  const m = re.exec(xml);
  return m ? decodeXml(m[1] ?? "") : "";
}

/** Remove HTML tags from a description blob, so previews stay readable. */
export function stripHtml(html: string): string {
  return decodeXml(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
