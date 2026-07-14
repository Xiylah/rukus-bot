import { getHighlightsConfig } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { HighlightsForm } from "./HighlightsForm";

export default async function HighlightsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const config = await getHighlightsConfig(guildId);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🔔 Highlights</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Members watch words with /highlight and get a DM when one is said. The
        words themselves are personal, so they aren&apos;t listed here: this page
        is only the on/off switch and the limits.
      </p>
      <HighlightsForm guildId={guildId} initial={config} />
    </div>
  );
}
