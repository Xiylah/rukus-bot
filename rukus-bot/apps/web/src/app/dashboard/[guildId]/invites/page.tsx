import { getInviteTrackerConfig, getSupabase } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { loadGuildOptions } from "@/lib/guildOptions";
import { InvitesForm, type InviterRow } from "./InvitesForm";

export default async function InvitesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);

  const [config, options, { data }] = await Promise.all([
    getInviteTrackerConfig(guildId),
    loadGuildOptions(guildId),
    getSupabase()
      .from("InviteUse")
      .select("inviterId")
      .eq("guildId", guildId)
      .limit(5000),
  ]);

  // PostgREST has no GROUP BY, so the tally happens here. The row cap above
  // bounds the work; a guild past 5000 tracked joins gets an approximate board
  // rather than a slow page, and /invites in Discord is exact either way.
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.inviterId, (counts.get(row.inviterId) ?? 0) + 1);
  }

  const leaderboard: InviterRow[] = [...counts.entries()]
    .map(([inviterId, count]) => ({ inviterId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📨 Invite tracker</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Works out which invite each new member came through, and keeps a running
        count per inviter. Members check their own with /invites.
      </p>
      <InvitesForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        leaderboard={leaderboard}
        totalTracked={data?.length ?? 0}
      />
    </div>
  );
}
