import {
  EmbedBuilder,
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

/** Does this message carry an image or video? */
export function hasMedia(message: {
  attachments: { size: number; values: () => Iterable<{ contentType: string | null; url: string }> };
  embeds: { image?: unknown; video?: unknown; thumbnail?: unknown }[];
}): boolean {
  for (const a of message.attachments.values()) {
    const type = a.contentType ?? "";
    if (type.startsWith("image/") || type.startsWith("video/")) return true;
  }
  // A pasted link (imgur, tenor, a direct file) arrives as an embed instead.
  return message.embeds.some((e) => e.image || e.video || e.thumbnail);
}

/** First media URL on a message, for keeping a record after deletion. */
export function mediaUrl(message: {
  attachments: { values: () => Iterable<{ contentType: string | null; url: string }> };
}): string {
  for (const a of message.attachments.values()) {
    const type = a.contentType ?? "";
    if (type.startsWith("image/") || type.startsWith("video/")) return a.url;
  }
  return "";
}

/** The contest currently running in a channel, or null. */
export async function activeContestFor(
  guildId: string,
  channelId: string,
): Promise<Contest | null> {
  return prisma.contest
    .findFirst({
      where: { guildId, channelId, ended: false, endsAt: { gt: new Date() } },
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
  channel: TextChannel,
  entry: ContestEntry,
  config: ContestsConfig,
): Promise<number> {
  const message = await channel.messages.fetch(entry.messageId).catch(() => null);
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

  const channel =
    guild.channels.cache.get(contest.channelId) ??
    (await guild.channels.fetch(contest.channelId).catch(() => null));

  const entries = await prisma.contestEntry.findMany({
    where: { contestId: contest.id },
  });

  const scored: { entry: ContestEntry; votes: number }[] = [];
  if (channel?.isTextBased()) {
    for (const entry of entries) {
      const votes = await countVotes(channel as TextChannel, entry, config);
      scored.push({ entry, votes });
    }
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
  const targetId = config.resultsChannelId || contest.channelId;
  const channel =
    guild.channels.cache.get(targetId) ??
    (await guild.channels.fetch(targetId).catch(() => null));
  if (!channel?.isSendable()) {
    log.warn(`Contest ${contest.id}: cannot post results to ${targetId}.`);
    return;
  }

  const lines = await Promise.all(
    placed.map(async (p, i) => {
      const who = await resolvedMention(guild, p.entry.userId);
      const link = `https://discord.com/channels/${guild.id}/${contest.channelId}/${p.entry.messageId}`;
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
  await channel
    .send({ embeds: [embed], allowedMentions: { parse: ["users"] } })
    .catch((e) => log.warn(`Contest results post failed: ${String(e)}`));

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
  const channel =
    guild.channels.cache.get(contest.channelId) ??
    (await guild.channels.fetch(contest.channelId).catch(() => null));
  if (!channel?.isTextBased()) return [];

  const entries = await prisma.contestEntry.findMany({
    where: { contestId: contest.id },
  });

  const scored: { userId: string; votes: number; messageId: string }[] = [];
  for (const entry of entries) {
    const votes = await countVotes(channel as TextChannel, entry, config);
    scored.push({ userId: entry.userId, votes, messageId: entry.messageId });
  }
  scored.sort((a, b) => b.votes - a.votes);
  return scored.slice(0, limit);
}

export type { Contest, ContestEntry };
