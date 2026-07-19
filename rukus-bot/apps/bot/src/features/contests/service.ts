import {
  EmbedBuilder,
  ChannelType,
  type ForumChannel,
  type Guild,
  type TextChannel,
} from "discord.js";
import { prisma, type Contest, type ContestEntry } from "@rukus/db";
import {
  rankEntries,
  hasAnyScore,
  type EntryScore,
  type ContestsConfig,
} from "@rukus/shared";
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
 * A short, typeable handle for an entry.
 *
 * A cuid is 25 characters, which nobody is typing on a phone. The last 4 are
 * enough to be unique within one contest's entry list (a contest with enough
 * entries to collide on 4 base-36 characters would need ~1600 entries before a
 * collision is even likely), and `resolveEntry` disambiguates by matching
 * against that contest's entries only.
 */
export function shortEntryId(entryId: string): string {
  return entryId.slice(-4).toUpperCase();
}

/** Pull a message id out of a Discord message link, or null if it is not one. */
function messageIdFromLink(input: string): string | null {
  const match = input.match(/channels\/\d+\/\d+\/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * Find the entry a member is referring to.
 *
 * Accepts a short id, a full entry id, a raw message id, or a message link,
 * because a judge on mobile will paste whichever of those is easiest to get at.
 * Scoped to one contest so a short id can never resolve to another contest's
 * entry.
 */
export async function resolveEntry(
  contestId: string,
  reference: string,
): Promise<ContestEntry | null> {
  const raw = reference.trim();
  if (!raw) return null;

  const entries = await prisma.contestEntry
    .findMany({ where: { contestId } })
    .catch(() => [] as ContestEntry[]);

  const linked = messageIdFromLink(raw);
  if (linked) {
    return entries.find((e) => e.messageId === linked) ?? null;
  }

  const exact = entries.find((e) => e.id === raw || e.messageId === raw);
  if (exact) return exact;

  const wanted = raw.toUpperCase().replace(/^#/, "");
  const matches = entries.filter((e) => shortEntryId(e.id) === wanted);
  // An ambiguous short id must not silently score the wrong entry.
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/**
 * Record (or update) one judge's score for one entry.
 *
 * An upsert on the [entryId, judgeId] unique constraint, so a judge changing
 * their mind overwrites rather than stacking a second score.
 */
export async function scoreEntry(
  entry: ContestEntry,
  judgeId: string,
  score: number,
): Promise<{ previous: number | null }> {
  const existing = await prisma.contestJudgement
    .findUnique({ where: { entryId_judgeId: { entryId: entry.id, judgeId } } })
    .catch(() => null);

  await prisma.contestJudgement.upsert({
    where: { entryId_judgeId: { entryId: entry.id, judgeId } },
    create: {
      contestId: entry.contestId,
      entryId: entry.id,
      judgeId,
      score,
    },
    update: { score },
  });

  return { previous: existing?.score ?? null };
}

/** Every judge score for a contest, grouped by entry id. */
export async function judgeScoresByEntry(
  contestId: string,
): Promise<Map<string, number[]>> {
  const rows = await prisma.contestJudgement
    .findMany({ where: { contestId }, select: { entryId: true, score: true } })
    .catch(() => [] as { entryId: string; score: number }[]);

  const byEntry = new Map<string, number[]>();
  for (const row of rows) {
    const list = byEntry.get(row.entryId);
    if (list) list.push(row.score);
    else byEntry.set(row.entryId, [row.score]);
  }
  return byEntry;
}

/**
 * Score every entry of a contest and rank them.
 *
 * The ranking maths itself is pure and lives in @rukus/shared; this function is
 * only the IO around it (read votes from Discord, read judgements from the DB).
 * Judge scores are only fetched when judging is on, so the default path costs
 * no extra query.
 */
async function scoreAllEntries(
  guild: Guild,
  contest: Contest,
  config: ContestsConfig,
): Promise<{ ranked: EntryScore[]; byId: Map<string, ContestEntry> }> {
  const entries = await prisma.contestEntry.findMany({
    where: { contestId: contest.id },
  });

  const judgements = config.judgingEnabled
    ? await judgeScoresByEntry(contest.id)
    : new Map<string, number[]>();

  // countVotes resolves each entry's own channel, so entries spread across the
  // contest's channels are all counted.
  const inputs = [];
  for (const entry of entries) {
    const votes = await countVotes(guild, entry, config);
    inputs.push({
      id: entry.id,
      votes,
      judgeScores: judgements.get(entry.id) ?? [],
      createdAt: entry.createdAt,
    });
  }

  const ranked = rankEntries(inputs, {
    judgingEnabled: config.judgingEnabled,
    judgeWeightPercent: config.judgeWeightPercent,
  });

  return { ranked, byId: new Map(entries.map((e) => [e.id, e])) };
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

  // Ranked highest first, blending votes and judge scores per config. With
  // judging off this is votes only, so nothing changes for existing servers.
  const { ranked, byId } = await scoreAllEntries(guild, contest, config);

  const scored = ranked
    .map((score) => {
      const entry = byId.get(score.id);
      return entry ? { entry, score } : null;
    })
    .filter((s): s is { entry: ContestEntry; score: EntryScore } => s !== null);

  // Persist the snapshot so results survive the entry messages being deleted.
  await Promise.all(
    scored.map((s) =>
      prisma.contestEntry
        .update({ where: { id: s.entry.id }, data: { votes: s.score.votes } })
        .catch(() => null),
    ),
  );

  const placed = scored
    .filter((s) => hasAnyScore(s.score, config.judgingEnabled))
    .slice(0, contest.winnerCount);
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
      votes: p.score.votes,
      url: p.entry.mediaUrl,
    })),
  };
}

async function announceResults(
  guild: Guild,
  contest: Contest,
  config: ContestsConfig,
  placed: { entry: ContestEntry; score: EntryScore }[],
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
      const votes = p.score.votes;
      const votePart = `**${votes}** vote${votes === 1 ? "" : "s"}`;
      // Show the judge number too, otherwise a blended result looks arbitrary:
      // the entry with fewer votes winning needs a visible reason.
      const judgePart =
        config.judgingEnabled && p.score.judgeCount > 0
          ? `, judges **${p.score.judgeAverage.toFixed(1)}**/10 (${p.score.judgeCount})`
          : config.judgingEnabled
            ? ", not judged"
            : "";
      return `${placeLabel(i)} ${who} with ${votePart}${judgePart} ([entry](${link}))`;
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
          `🏆 You placed in **${contest.title}** in **${guild.name}** with ${p.score.votes} vote(s). Congratulations!`,
        )
        .catch(() => {});
    }
  }
}

/**
 * Live standings, for /contest status.
 *
 * Ranked by the same blend the final result will use, so the board a host looks
 * at mid-contest is not reordered by surprise at the end.
 */
export async function standings(
  guild: Guild,
  contest: Contest,
  config: ContestsConfig,
  limit = 10,
): Promise<
  {
    userId: string;
    votes: number;
    messageId: string;
    shortId: string;
    judgeAverage: number;
    judgeCount: number;
  }[]
> {
  const { ranked, byId } = await scoreAllEntries(guild, contest, config);

  return ranked.slice(0, limit).flatMap((score) => {
    const entry = byId.get(score.id);
    if (!entry) return [];
    return [
      {
        userId: entry.userId,
        votes: score.votes,
        messageId: entry.messageId,
        shortId: shortEntryId(entry.id),
        judgeAverage: score.judgeAverage,
        judgeCount: score.judgeCount,
      },
    ];
  });
}

/**
 * Every entry of a contest with its short id, for /contest entries.
 *
 * Deliberately does NOT count votes: this list exists so a judge can find the
 * entry they want to score, and counting votes would mean one Discord fetch per
 * entry for information the judge did not ask for.
 */
export async function listEntries(
  contestId: string,
): Promise<{ entry: ContestEntry; shortId: string }[]> {
  const entries = await prisma.contestEntry.findMany({
    where: { contestId },
    orderBy: { createdAt: "asc" },
  });
  return entries.map((entry) => ({ entry, shortId: shortEntryId(entry.id) }));
}

export type { Contest, ContestEntry };
