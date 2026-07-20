import type { Message } from "discord.js";
import type { ModerationConfig } from "@rukus/shared";

/**
 * Anti-spam / anti-scam.
 *
 * The signature of the compromised-account crypto scam (MrBeast giveaways,
 * "free $2,700", casino promo codes) is that the SAME message is blasted into
 * many channels within seconds. No legitimate member does that, so it's a far
 * more reliable signal than trying to blocklist ever-changing scam domains.
 *
 * We also score obvious scam phrasing and can gate links behind account age.
 */

// ---------------- recent-message tracking ----------------

interface Post {
  channelId: string;
  messageId: string;
  at: number;
}

/** Per-user, per-message-fingerprint history of where it was posted. */
const recent = new Map<string, Post[]>();
const TRACK_MAX = 5000;
let lastSweep = 0;

/** Collapse a message to a fingerprint so trivial edits still match. */
export function fingerprint(content: string): string {
  return content
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " url ") // any link is "a link"
    .replace(/<@!?\d+>/g, " ping ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, posts] of recent) {
    const kept = posts.filter((p) => now - p.at < windowMs);
    if (kept.length === 0) recent.delete(key);
    else recent.set(key, kept);
  }
  // Hard cap so a raid can't grow this unbounded.
  while (recent.size > TRACK_MAX) {
    const oldest = recent.keys().next().value;
    if (oldest === undefined) break;
    recent.delete(oldest);
  }
}

// ---------------- scam heuristics ----------------

/** Phrases that are near-worthless alone but damning in combination. */
const SCAM_SIGNALS: [RegExp, number][] = [
  [/\b(free|claim|giveaway|airdrop|reward)\b/i, 1],
  [/\b(crypto|bitcoin|btc|eth|usdt|nft|casino|rakeback|promo\s*code)\b/i, 2],
  [/\b(withdraw|deposit|payout|bonus)\b/i, 2],
  [/\$\s?\d{2,}|\d{2,}\s?(usd|usdt|dollars)\b/i, 2],
  [/\b(steam|nitro|discord)\s+(gift|nitro|giveaway)\b/i, 2],
  [/\b(register|sign\s*up|click|visit)\b.*\b(link|site|website|now)\b/i, 1],
  [/\bdm\s+me\b|\bmessage\s+me\b/i, 1],
  [/\b(limited|hurry|expires?|act\s+now|first\s+\d+)\b/i, 1],
  [/@everyone|@here/i, 2],
];

const URL_RE = /https?:\/\/([^\s/]+)/gi;

/**
 * Hosts that serve media, not payloads.
 *
 * A link to one of these is a gif or a video, so it does not make an otherwise
 * innocent message suspicious. Without this a Tenor gif whose slug happens to
 * read /view/crypto-bitcoin-money-gif-25340957 scored a link bonus on top of
 * the keyword and hit the timeout threshold on its own.
 */
const MEDIA_HOSTS = [
  "tenor.com",
  "giphy.com",
  "gfycat.com",
  "imgur.com",
  "youtube.com",
  "youtu.be",
  "twitch.tv",
  "cdn.discordapp.com",
  "media.discordapp.net",
  "discordapp.com",
  "discord.com",
];

/**
 * 0+ score; 4 or more means "almost certainly a scam".
 *
 * Scores the PROSE only. URLs are stripped first, because a URL's path is not
 * something the author wrote: a gif slug carries whatever words the uploader
 * chose, and judging a member by them timed out someone for posting a built-in
 * Discord gif. Domains are judged by blockedDomains, which is the precise tool
 * for that and is not a guess.
 */
export function scamScore(content: string): number {
  const prose = content.replace(/https?:\/\/\S+/gi, " ");

  let score = 0;
  // Tracked separately: the link bonus needs to know a real signal fired, and
  // the threshold needs to know how many independent categories matched.
  let categories = 0;
  for (const [re, weight] of SCAM_SIGNALS) {
    if (re.test(prose)) {
      score += weight;
      categories++;
    }
  }

  // A link plus scam wording is worse than either alone, but only when the
  // wording came from the message itself and the link can actually carry a
  // scam. Media hosts are excluded on both counts.
  const risky = extractDomains(content).some(
    (host) => !MEDIA_HOSTS.some((m) => domainMatches(host, m)),
  );
  if (risky && score > 0) score += 2;

  // One keyword must never be enough on its own. "crypto" plus a link is a
  // person sharing a news article; a real scam stacks giveaway wording, a
  // dollar amount and an @everyone, and clears this easily.
  if (categories < 2) return 0;

  return score;
}

/** Extract lowercase hostnames from a message. */
export function extractDomains(content: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(content))) {
    out.push(m[1]!.toLowerCase().replace(/^www\./, ""));
  }
  return out;
}

function domainMatches(host: string, pattern: string): boolean {
  const p = pattern.toLowerCase().replace(/^www\./, "").trim();
  if (!p) return false;
  return host === p || host.endsWith(`.${p}`);
}

// ---------------- detection ----------------

export type SpamReason =
  | "cross-posting the same message"
  | "repeating the same message"
  | "scam content"
  | "blocked domain"
  | "links not allowed"
  | "new account posting links";

export interface SpamHit {
  reason: SpamReason;
  /** Every message of theirs we should delete (includes the current one). */
  messages: { channelId: string; messageId: string }[];
}

/**
 * Check a message for spam/scam. Records it in the tracker as a side effect,
 * so this must be called at most once per message.
 */
export function checkSpam(
  message: Message<true>,
  config: ModerationConfig,
): SpamHit | null {
  if (!config.antiSpamEnabled) return null;
  const content = message.content?.trim();
  if (!content) return null;

  const now = Date.now();
  const windowMs = config.crossPostWindowSec * 1000;
  sweep(now, windowMs);

  const domains = extractDomains(content);
  const hasLink = domains.length > 0;
  const self = [{ channelId: message.channelId, messageId: message.id }];

  // --- Blocked domains (always enforced when listed) ---
  for (const host of domains) {
    if (config.blockedDomains.some((p) => domainMatches(host, p))) {
      return { reason: "blocked domain", messages: self };
    }
  }

  // --- Link policy ---
  if (hasLink) {
    const allowed = domains.every((host) =>
      config.allowedDomains.some((p) => domainMatches(host, p)),
    );
    if (config.blockLinks && !allowed) {
      return { reason: "links not allowed", messages: self };
    }
    if (config.minAccountAgeDaysForLinks > 0 && !allowed) {
      const ageDays =
        (now - message.author.createdTimestamp) / 86_400_000;
      if (ageDays < config.minAccountAgeDaysForLinks) {
        return { reason: "new account posting links", messages: self };
      }
    }
  }

  // --- Scam heuristics ---
  if (config.scamHeuristics && scamScore(content) >= 4) {
    return { reason: "scam content", messages: self };
  }

  // --- Cross-post / duplicate detection ---
  const fp = fingerprint(content);
  // Ignore very short text: "lol" in five channels isn't a scam blast.
  if (fp.length >= 12) {
    const key = `${message.guildId}:${message.author.id}:${fp}`;
    const posts = (recent.get(key) ?? []).filter((p) => now - p.at < windowMs);
    posts.push({ channelId: message.channelId, messageId: message.id, at: now });
    recent.set(key, posts);

    const distinctChannels = new Set(posts.map((p) => p.channelId)).size;
    if (distinctChannels >= config.crossPostChannels) {
      recent.delete(key); // don't re-trigger on the same burst
      return {
        reason: "cross-posting the same message",
        messages: posts.map((p) => ({
          channelId: p.channelId,
          messageId: p.messageId,
        })),
      };
    }
    if (posts.length >= config.duplicateLimit) {
      recent.delete(key);
      return {
        reason: "repeating the same message",
        messages: posts.map((p) => ({
          channelId: p.channelId,
          messageId: p.messageId,
        })),
      };
    }
  }

  return null;
}

/** Forget a user's tracked posts (e.g. after they're punished). */
export function clearUser(guildId: string, userId: string): void {
  const prefix = `${guildId}:${userId}:`;
  for (const key of recent.keys()) {
    if (key.startsWith(prefix)) recent.delete(key);
  }
}
