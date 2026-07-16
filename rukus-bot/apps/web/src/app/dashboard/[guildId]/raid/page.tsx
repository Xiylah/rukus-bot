import { getRaidConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { RaidForm } from "./RaidForm";

export default async function RaidPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getRaidConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🚨 Raid Protection</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Trip an automatic response when joins spike, the signature of a raid or a
        bot swarm. Anything from a quiet alert to a full lockdown, with an
        optional auto-lift so a false alarm clears itself.
      </p>
      <RaidForm guildId={guildId} initial={config} channels={options.channels} />
    </div>
  );
}
