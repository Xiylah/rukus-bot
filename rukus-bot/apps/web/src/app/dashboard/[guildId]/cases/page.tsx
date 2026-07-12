import { getSupabase } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { isGuildAdmin } from "@/lib/discord";
import { CasesTable, type CaseRow } from "./CasesTable";

export default async function CasesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  // Only Administrators may delete case records.
  const { guild } = await requireGuildAccess(guildId);
  const canDelete = isGuildAdmin(guild);

  const { data } = await getSupabase()
    .from("ModCase")
    .select("number, action, userId, userTag, moderatorId, reason, durationMin, createdAt, proofToken")
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
    proofToken: c.proofToken ?? null,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📋 Cases</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Every /warn, /mute, /timeout, /kick and /ban is recorded here. Use
        /history in Discord for a single member&apos;s record.
        {canDelete && " Tick cases to delete them (e.g. test cases)."}
      </p>
      <CasesTable cases={cases} guildId={guildId} canDelete={canDelete} />
    </div>
  );
}
