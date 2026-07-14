import { getStarboardConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { StarboardForm } from "./StarboardForm";

export default async function StarboardPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getStarboardConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">⭐ Starboard</h1>
      <p className="mb-6 text-sm text-zinc-400">
        When enough people react to a message with the star emoji, it gets
        mirrored to a highlights channel. The count updates live, and a message
        that falls back below the threshold is removed from the board.
      </p>
      <StarboardForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
      />
    </div>
  );
}
