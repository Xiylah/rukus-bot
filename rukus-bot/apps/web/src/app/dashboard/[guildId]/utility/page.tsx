import { getUtilityConfig } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { UtilityForm } from "./UtilityForm";

export default async function UtilityPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const config = await getUtilityConfig(guildId);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🧰 Utility</h1>
      <p className="mb-6 text-sm text-zinc-400">
        The small staff tools: reaction polls and the embed builder. Both are
        limited to members with Manage Messages.
      </p>
      <UtilityForm guildId={guildId} initial={config} />
    </div>
  );
}
