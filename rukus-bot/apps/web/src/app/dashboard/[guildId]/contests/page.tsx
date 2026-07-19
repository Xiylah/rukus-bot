import {
  getContestsConfig,
  getRunningContest,
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
    getRunningContest(guildId),
    getPastContests(guildId),
  ]);

  const entryRows = running
    ? await getContestEntries(guildId, running.id)
    : [];

  // One batched member fetch names every entrant and past winner, no per-row
  // lookup.
  const names = await resolveMemberNames(guildId, [
    ...entryRows.map((e) => e.userId),
    ...past.flatMap((c) => c.winnerIds),
  ]);

  const entries: GalleryEntry[] = entryRows.map((e) => ({
    id: e.id,
    userId: e.userId,
    userName: names.get(e.userId) ?? e.userId,
    mediaUrl: e.mediaUrl,
    votes: e.votes,
    messageLink: `https://discord.com/channels/${guildId}/${e.channelId}/${e.messageId}`,
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
          contestTitle={running?.title ?? null}
          contestEndsAt={running?.endsAt ?? null}
          initialEntries={entries}
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
