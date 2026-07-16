import Link from "next/link";
import { getLevelingConfig, getLeaderboardRows } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { fetchGuildChannels, CHANNEL_TYPE } from "@/lib/discord";
import { resolveMemberNames } from "@/lib/memberNames";
import { LevelingForm } from "./LevelingForm";
import { LeaderboardTable, type NamedLeaderboardRow } from "./LeaderboardTable";

export default async function LevelingPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  // loadGuildOptions only exposes text channels; voice XP needs to exclude voice
  // ones, so those are pulled here (the fetch is deduped and cached by Next).
  const [config, options, allChannels, rows] = await Promise.all([
    getLevelingConfig(guildId),
    loadGuildOptions(guildId),
    fetchGuildChannels(guildId),
    getLeaderboardRows(guildId, 100),
  ]);

  // 13 is a stage channel, which CHANNEL_TYPE does not name; the bot awards
  // voice XP in stages too, so they belong in the ignore picker.
  const STAGE = 13;
  const voiceChannels = allChannels
    .filter((c) => c.type === CHANNEL_TYPE.voice || c.type === STAGE)
    .map((c) => ({ id: c.id, name: c.name }));

  // One batched member fetch names the whole leaderboard, so the table can show
  // and search by name instead of a raw id.
  const names = await resolveMemberNames(
    guildId,
    rows.map((r) => r.userId),
  );
  const namedRows: NamedLeaderboardRow[] = rows.map((r) => ({
    ...r,
    name: names.get(r.userId) ?? r.userId,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📈 Leveling & XP</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Members earn XP for talking and climb levels on the standard MEE6 curve,
        so anyone importing from another bot keeps their rank. Members check
        themselves with /rank and the server with /leaderboard.
      </p>

      <LevelingForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        voiceChannels={voiceChannels}
        roles={options.roles}
        grantableRoles={options.grantableRoles}
      />

      <h2 className="mb-1 mt-10 text-lg font-semibold text-white">
        🏆 Leaderboard
      </h2>
      <p className="mb-4 text-sm text-zinc-400">
        The top 100 members by XP, live from the bot.{" "}
        {config.publicLeaderboard ? (
          <>
            Anyone can see this at{" "}
            <Link
              href={`/leaderboard/${guildId}`}
              target="_blank"
              className="text-blurple hover:underline"
            >
              /leaderboard/{guildId}
            </Link>
            , no login needed.
          </>
        ) : (
          <>
            The public page is switched off, so only staff can see this. Turn on
            &ldquo;Public leaderboard page&rdquo; above to share it.
          </>
        )}
      </p>
      <LeaderboardTable rows={namedRows} />
    </div>
  );
}
