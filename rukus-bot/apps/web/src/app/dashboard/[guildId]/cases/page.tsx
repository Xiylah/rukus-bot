import { getSupabase } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { isGuildAdmin } from "@/lib/discord";
import { resolveMemberNames } from "@/lib/memberNames";
import { Pagination } from "@/components/Pagination";
import { CasesTable, type CaseRow } from "./CasesTable";

const PER_PAGE = 50;

export default async function CasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { guildId } = await params;
  const { page: rawPage } = await searchParams;
  // Only Administrators may delete case records.
  const { guild } = await requireGuildAccess(guildId);
  const canDelete = isGuildAdmin(guild);

  const page = Math.max(1, Number(rawPage) || 1);
  const offset = (page - 1) * PER_PAGE;

  const { data, count } = await getSupabase()
    .from("ModCase")
    .select(
      "number, action, userId, userTag, moderatorId, reason, durationMin, createdAt, proofToken",
      { count: "exact" },
    )
    .eq("guildId", guildId)
    .order("number", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  const rows = data ?? [];
  const total = count ?? rows.length;
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));

  // One batched member fetch resolves every moderator on the page to a name,
  // rather than a lookup per row.
  const names = await resolveMemberNames(
    guildId,
    rows.map((c) => c.moderatorId),
  );

  const cases: CaseRow[] = rows.map((c) => ({
    number: c.number,
    action: c.action,
    userId: c.userId,
    userTag: c.userTag ?? c.userId,
    moderatorId: c.moderatorId,
    moderatorName: names.get(c.moderatorId) ?? c.moderatorId,
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
      <Pagination
        basePath={`/dashboard/${guildId}/cases`}
        page={page}
        lastPage={lastPage}
        total={total}
        shown={cases.length}
        offset={offset}
        label="cases"
      />
    </div>
  );
}
