import { getContestsConfig } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { loadGuildOptions } from "@/lib/guildOptions";
import { ContestsForm } from "./ContestsForm";

export default async function ContestsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);

  const [config, options] = await Promise.all([
    getContestsConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📸 Contests</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Run a photo or video contest: members post an entry in the channel,
        everyone votes with a reaction, and the most-voted entries win when the
        timer runs out. Start one with{" "}
        <code className="rounded bg-panel px-1">/contest start</code>.
      </p>
      <ContestsForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
      />
    </div>
  );
}
