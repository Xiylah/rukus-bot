import {
  EmbedBuilder,
  ChannelType,
  type ForumChannel,
  type Guild,
  type TextChannel,
} from "discord.js";
import { prisma, type Contest, type ContestEntry } from "@rukus/db";
import type { ContestsConfig } from "@rukus/shared";
import { log } from "../../lib/logger.js";
import { resolvedMention } from "../../lib/mentions.js";

/**
 * Photo/video contests.
 *
 * Entries are ordinary member messages carrying an image or video, so nobody
 * has to learn a command: post in the contest channel and you are in. Votes are
 * reactions with one configured emoji, counted at the end from Discord rather
 * than tallied live, because a live counter would need a write per reaction and
 * reactions arrive in bursts.
 */

/** Medals for the first three places; later places fall back to a number. */
const PLACE_LABELS = ["🥇", "🥈", "🥉"];

export function placeLabel(index: number): string {
  return PLACE_LABELS[index] ?? `#${index + 1}`;
}

/**
 * Hosts whose links are an image or video even though the URL has no file
 * extension. Without this a member on YouTube, Imgur or Streamable is not
 * entered, which matters because uploading a real video needs Nitro: a link is
 * the only way most people can enter a video contest at all.
 */
const MEDIA_HOSTS = [
  // video
  "youtube.com", "youtu.be", "streamable.com", "twitch.tv", "clips.twitch.tv",
  "vimeo.com", "tiktok.com", "medal.tv", "outplayed.tv", "dailymotion.com",
  // images and albums
  "imgur.com", "i.imgur.com", "gyazo.com", "prnt.sc", "prntscr.com",
  "lightshot.cc", "postimg.cc", "ibb.co", "imgbb.com", "flickr.com",
  "tenor.com", "giphy.com", "gfycat.com", "redgifs.com",
  // general file hosts people paste screenshots and clips from
  "cdn.discordapp.com", "media.discordapp.net", "drive.google.com",
  "dropbox.com", "onedrive.live.com", "1drv.ms",
];

/** A URL ending in an image or video file, whatever the host. */
const MEDIA_EXTENSION =
  /\.(png|jpe?g|gif|webp|bmp|avif|heic|svg|mp4|mov|webm|mkv|avi|m4v|gifv)(\?|#|$)/i;

const URL_RE = /https?:\/\/[^\s<>()[\]]+/gi;

/** Every http(s) link in the text. */
function linksIn(content: string): string[] {
  return content.match(URL_RE) ?? [];
}

/**
 * Is this URL an image/video, by extension or by known host?
 *
 * `extraHosts` are the server's own additions, so a community can accept a host
 * the built-in list has never heard of without waiting for a code change.
 */
export function isMediaLink(url: string, extraHosts: string[] = []): boolean {
  if (MEDIA_EXTENSION.test(url)) return true;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const all = [
      ...MEDIA_HOSTS,
      ...extraHosts.map((h) => h.toLowerCase().replace(/^www\./, "").trim()),
    ];
    return all.some((h) => h && (host === h || host.endsWith(`.${h}`)));
  } catch {
    return false;
  }
}

/**
 * Does this message carry an image or video?
 *
 * Checks attachments, then LINKS IN THE TEXT, and only then embeds. The link
 * check is the important one: Discord does not attach an embed until it has
 * fetched the URL, which happens a moment AFTER the message arrives, so on
 * messageCreate the embeds array is nearly always still empty. Relying on it
 * alone silently rejected every pasted YouTube or Imgur entry.
 */
export function hasMedia(
  message: {
    content?: string;
    attachments: { size: number; values: () => Iterable<{ contentType: string | null; url: string }> };
    embeds: { image?: unknown; video?: unknown; thumbnail?: unknown }[];
  },
  opts: { allowLinks?: boolean; extraHosts?: string[] } = {},
): boolean {
  for (const a of message.attachments.values()) {
    const type = a.contentType ?? "";
    if (type.startsWith("image/") || type.startsWith("video/")) return true;
  }
  const allowLinks = opts.allowLinks ?? true;
  if (
    allowLinks &&
    linksIn(message.content ?? "").some((u) => isMediaLink(u, opts.extraHosts))
  ) {
    return true;
  }
  // Late arrival: if the embed did resolve in time, take it.
  return message.embeds.some((e) => e.image || e.video || e.thumbnail);
}

/** First media URL on a message, for keeping a record after deletion. */
export function mediaUrl(
  message: {
    content?: string;
    attachments: { values: () => Iterable<{ contentType: string | null; url: string }> };
  },
  opts: { allowLinks?: boolean; extraHosts?: string[] } = {},
): string {
  for (const a of message.attachments.values()) {
    const type = a.contentType ?? "";
    if (type.startsWith("image/") || type.startsWith("video/")) return a.url;
  }
  if (opts.allowLinks ?? true) {
    return (
      linksIn(message.content ?? "").find((u) => isMediaLink(u, opts.extraHosts)) ??
      ""
    );
  }
  return "";
}

/**
 * The contest currently running in a channel, or null.
 *
 * Takes one id or several. Callers inside a thread pass both the thread's id and
 * its parent's, because a contest may be set on the forum/channel (covering
 * every post inside it) or on one specific thread.
 */
export async function activeContestFor(
  guildId: string,
  channelId: string | string[],
): Promise<Contest | null> {
  const ids = Array.isArray(channelId) ? channelId : [channelId];
  if (ids.length === 0) return null;
  return prisma.contest
    .findFirst({
      where: {
        guildId,
        // A contest can span several channels, so match if any candidate is in
        // its list rather than comparing a single id.
        channelIds: { hasSome: ids },
        ended: false,
        endsAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => null);
}

/**
 * Count the votes on one entry.
 *
 * Reads the live reaction from Discord rather than a stored counter: a stored
 * count would need a DB write per reaction (and per un-reaction), and would
 * drift the moment a single event was missed. Fetching the reactors is also the
 * only way to drop the entrant's own vote.
 */
export async function countVotes(
  guild: Guild,
  entry: ContestEntry,
  config: ContestsConfig,
): Promise<number> {
  // Entries can live in different channels of the same contest, so the channel
  // comes from the entry rather than being passed in.
  const channel =
    guild.channels.cache.get(entry.channelId) ??
    (await guild.channels.fetch(entry.channelId).catch(() => null));
  if (!channel?.isTextBased()) return 0;

  const message = await (channel as TextChannel).messages
    .fetch(entry.messageId)
    .catch(() => null);
  if (!message) return 0;

  const reaction = message.reactions.cache.find(
    (r) => r.emoji.name === config.voteEmoji || r.emoji.toString() === config.voteEmoji,
  );
  if (!reaction) return 0;

  if (!config.ignoreSelfVotes) {
    // The bot pre-adds the vote emoji, so its own reaction never counts.
    return Math.max(0, reaction.count - (reaction.me ? 1 : 0));
  }

  const users = await reaction.users.fetch().catch(() => null);
  if (!users) return Math.max(0, reaction.count - (reaction.me ? 1 : 0));

  let votes = 0;
  for (const user of users.values()) {
    if (user.bot) continue;
    if (user.id === entry.userId) continue; // self-vote
    votes++;
  }
  return votes;
}

/**
 * End a contest: count every entry, rank them, announce the placed winners.
 *
 * Returns null when another path (a manual /contest end racing the sweeper)
 * already ended it, so only one of them announces.
 */
export async function endContest(
  guild: Guild,
  contest: Contest,
  config: ContestsConfig,
): Promise<{ winners: { userId: string; votes: number; url: string }[] } | null> {
  // Conditional write: whoever flips `ended` first owns the announcement.
  const claimed = await prisma.contest.updateMany({
    where: { id: contest.id, ended: false },
    data: { ended: true },
  });
  if (claimed.count === 0) return null;

  const entries = await prisma.contestEntry.findMany({
    where: { contestId: contest.id },
  });

  // countVotes resolves each entry's own channel, so entries spread across the
  // contest's channels are all counted.
  const scored: { entry: ContestEntry; votes: number }[] = [];
  for (const entry of entries) {
    const votes = await countVotes(guild, entry, config);
    scored.push({ entry, votes });
  }

  // Highest first; a tie is broken by who posted first, which is at least a
  // rule everyone can see rather than an arbitrary shuffle.
  scored.sort(
    (a, b) =>
      b.votes - a.votes ||
      a.entry.createdAt.getTime() - b.entry.createdAt.getTime(),
  );

  // Persist the snapshot so results survive the entry messages being deleted.
  await Promise.all(
    scored.map((s) =>
      prisma.contestEntry
        .update({ where: { id: s.entry.id }, data: { votes: s.votes } })
        .catch(() => null),
    ),
  );

  const placed = scored.filter((s) => s.votes > 0).slice(0, contest.winnerCount);
  await prisma.contest
    .update({
      where: { id: contest.id },
      data: { winnerIds: placed.map((p) => p.entry.userId) },
    })
    .catch(() => null);

  await announceResults(guild, contest, config, placed);

  return {
    winners: placed.map((p) => ({
      userId: p.entry.userId,
      votes: p.votes,
      url: p.entry.mediaUrl,
    })),
  };
}

async function announceResults(
  guild: Guild,
  contest: Contest,
  config: ContestsConfig,
  placed: { entry: ContestEntry; votes: number }[],
): Promise<void> {
  // Fall back to the contest's first channel, which is where the announcement
  // was posted.
  const targetId = config.resultsChannelId || contest.channelIds[0];
  if (!targetId) return;
  const channel =
    guild.channels.cache.get(targetId) ??
    (await guild.channels.fetch(targetId).catch(() => null));
  // A forum cannot be sent to, only posted in, so results become a new post.
  const isForum = channel?.type === ChannelType.GuildForum;
  if (!channel || (!isForum && !channel.isSendable())) {
    log.warn(`Contest ${contest.id}: cannot post results to ${targetId}.`);
    return;
  }

  const lines = await Promise.all(
    placed.map(async (p, i) => {
      const who = await resolvedMention(guild, p.entry.userId);
      // The entry's own channel, not the contest's first one: a winner may have
      // posted in any of the contest's channels.
      const link = `https://discord.com/channels/${guild.id}/${p.entry.channelId}/${p.entry.messageId}`;
      return `${placeLabel(i)} ${who} with **${p.votes}** vote${p.votes === 1 ? "" : "s"} ([entry](${link}))`;
    }),
  );

  const body = lines.length > 0 ? lines.join("\n") : "_Nobody got a vote._";
  const content = config.announceMessage
    .replace(/\{winners\}/gi, body)
    .replace(/\{title\}/gi, contest.title)
    .replace(/\{count\}/gi, String(placed.length));

  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(config.embedColor.slice(1), 16))
    .setTitle(`🏆 ${contest.title}`)
    .setDescription(content.slice(0, 4000))
    .setTimestamp();

  // Winners are mentioned, so lock mentions to users: a template containing
  // @everyone must never be able to mass-ping.
  const payload = {
    embeds: [embed],
    allowedMentions: { parse: ["users"] as const },
  };
  if (isForum) {
    await (channel as ForumChannel).threads
      .create({
        name: `Results: ${contest.title}`.slice(0, 100),
        message: payload,
      })
      .catch((e) => log.warn(`Contest results post failed: ${String(e)}`));
  } else {
    await channel
      .send(payload)
      .catch((e) => log.warn(`Contest results post failed: ${String(e)}`));
  }

  if (config.dmWinners) {
    for (const p of placed) {
      const user = await guild.client.users.fetch(p.entry.userId).catch(() => null);
      await user
        ?.send(
          `🏆 You placed in **${contest.title}** in **${guild.name}** with ${p.votes} vote(s). Congratulations!`,
        )
        .catch(() => {});
    }
  }
}

/** Live standings, for /contest status. */
export async function standings(
  guild: Guild,
  contest: Contest,
  config: ContestsConfig,
  limit = 10,
): Promise<{ userId: string; votes: number; messageId: string }[]> {
  const entries = await prisma.contestEntry.findMany({
    where: { contestId: contest.id },
  });

  const scored: { userId: string; votes: number; messageId: string }[] = [];
  for (const entry of entries) {
    const votes = await countVotes(guild, entry, config);
    scored.push({ userId: entry.userId, votes, messageId: entry.messageId });
  }
  scored.sort((a, b) => b.votes - a.votes);
  return scored.slice(0, limit);
}

export type { Contest, ContestEntry };
