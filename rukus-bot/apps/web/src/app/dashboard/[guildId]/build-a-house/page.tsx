import { notFound } from "next/navigation";
import { BUILD_A_HOUSE_GUILD_ID } from "@rukus/shared";
import { getBuildAHouseConfig } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { loadGuildOptions } from "@/lib/guildOptions";
import { LeaderboardSettings } from "./settings";

export default async function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  if (guildId !== BUILD_A_HOUSE_GUILD_ID) notFound();
  const [config, options] = await Promise.all([getBuildAHouseConfig(guildId), loadGuildOptions(guildId)]);
  return <div>
    <h1 className="mb-1 text-2xl font-bold text-white">Build A House Leaderboard</h1>
    <p className="mb-6 text-sm text-zinc-400">Choose the channel for in-game stat-card screenshots.</p>
    <LeaderboardSettings guildId={guildId} initial={config} channels={options.channels} />
  </div>;
}
