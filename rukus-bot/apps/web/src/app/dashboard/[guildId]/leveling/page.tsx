import { getLevelingConfig, getLeaderboardRows } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { LevelingForm } from "./LevelingForm";
import { LeaderboardTable } from "./LeaderboardTable";

export default async function LevelingPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options, rows] = await Promise.all([
    getLevelingConfig(guildId),
    loadGuildOptions(guildId),
    getLeaderboardRows(guildId, 100),
  ]);

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
        roles={options.roles}
        grantableRoles={options.grantableRoles}
      />

      <h2 className="mb-1 mt-10 text-lg font-semibold text-white">
        🏆 Leaderboard
      </h2>
      <p className="mb-4 text-sm text-zinc-400">
        The top 100 members by XP, live from the bot.
      </p>
      <LeaderboardTable rows={rows} />
    </div>
  );
}
