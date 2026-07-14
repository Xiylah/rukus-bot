import { getSuggestionsConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { SuggestionsForm } from "./SuggestionsForm";

export default async function SuggestionsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getSuggestionsConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🗳️ Suggestions</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Members post ideas with <code>/suggest</code> and the server votes on
        them. Staff decide with <code>/suggestion approve</code>,{" "}
        <code>deny</code>, <code>consider</code>, or <code>implement</code>.
      </p>
      <SuggestionsForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
      />
    </div>
  );
}
