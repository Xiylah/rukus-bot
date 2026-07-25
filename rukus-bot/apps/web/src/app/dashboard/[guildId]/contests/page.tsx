import {
  getContestsConfig,
  getRunningContests,
  getPastContests,
  getContestEntries,
} from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { loadGuildOptions } from "@/lib/guildOptions";
import { resolveMemberNames } from "@/lib/memberNames";
import { ContestsForm } from "./ContestsForm";
import {
  EntryGallery,
  type GalleryEntry,
  type RunningContest,
  type PastContest,
} from "./EntryGallery";

export default async function ContestsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);

  const [config, options, running, past] = await Promise.all([
    getContestsConfig(guildId),
    loadGuildOptions(guildId),
    getRunningContests(guildId),
    getPastContests(guildId),
  ]);

  // Entries for every running contest, fetched in parallel and kept grouped by
  // contest so the gallery can show one section per contest instead of one
  // merged pile that hides which forum each entry came from.
  const entryRowsByContest = await Promise.all(
    running.map((c) => getContestEntries(guildId, c.id)),
  );

  // One batched member fetch names every entrant across every contest, plus the
  // past winners, so there is a single lookup rather than one per row.
  const names = await resolveMemberNames(guildId, [
    ...entryRowsByContest.flat().map((e) => e.userId),
    ...past.flatMap((c) => c.winnerIds),
  ]);

  const toEntry = (e: {
    id: string;
    userId: string;
    mediaUrl: string;
    votes: number;
    channelId: string;
    messageId: string;
  }): GalleryEntry => ({
    id: e.id,
    userId: e.userId,
    userName: names.get(e.userId) ?? e.userId,
    mediaUrl: e.mediaUrl,
    votes: e.votes,
    messageLink: `https://discord.com/channels/${guildId}/${e.channelId}/${e.messageId}`,
  });

  const runningContests: RunningContest[] = running.map((c, i) => ({
    id: c.id,
    title: c.title,
    endsAt: c.endsAt,
    entries: (entryRowsByContest[i] ?? []).map(toEntry),
  }));

  const pastContests: PastContest[] = past.map((c) => ({
    id: c.id,
    title: c.title,
    endsAt: c.endsAt,
    winners: c.winnerIds.map((id) => ({
      userId: id,
      userName: names.get(id) ?? id,
    })),
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📸 Contests</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Run a photo or video contest: members post an entry in the channel,
        everyone votes with a reaction, and the most-voted entries win when the
        timer runs out. Start one with{" "}
        <code className="rounded bg-panel px-1">/contest start</code>.
      </p>

      <div className="mb-5">
        <EntryGallery
          guildId={guildId}
          runningContests={runningContests}
          pastContests={pastContests}
        />
      </div>

      <ContestsForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
      />
    </div>
  );
}
