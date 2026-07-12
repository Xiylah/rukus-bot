import { getSupabase } from "@rukus/supabase";
import { CasesTable, type CaseRow } from "./CasesTable";

export default async function CasesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  const { data } = await getSupabase()
    .from("ModCase")
    .select("number, action, userId, userTag, moderatorId, reason, durationMin, createdAt")
    .eq("guildId", guildId)
    .order("number", { ascending: false })
    .limit(200);

  const cases: CaseRow[] = (data ?? []).map((c) => ({
    number: c.number,
    action: c.action,
    userId: c.userId,
    userTag: c.userTag ?? c.userId,
    moderatorId: c.moderatorId,
    reason: c.reason ?? "",
    durationMin: c.durationMin,
    createdAt: c.createdAt,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📋 Cases</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Every /warn, /timeout, /kick and /ban is recorded here. Use /history in
        Discord for a single member's record.
      </p>
      <CasesTable cases={cases} />
    </div>
  );
}
