import { getEmbedsConfig } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { loadGuildOptions } from "@/lib/guildOptions";
import { EmbedsForm } from "./EmbedsForm";

export default async function EmbedsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);

  const [config, options] = await Promise.all([
    getEmbedsConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📝 Embeds</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Build rules, info and announcement messages, post them to any channel,
        and edit them later. Updating changes the original message, so its
        reactions, pin and links stay exactly where they are.
      </p>
      <EmbedsForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
      />
    </div>
  );
}
