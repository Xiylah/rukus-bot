import { getAutoResponderConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { AutoResponderForm } from "./AutoResponderForm";

export default async function AutoResponderPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getAutoResponderConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">💬 Auto-responder</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Build your own rules: what phrases to answer, what to ignore, how loosely
        to match, where it applies, and exactly what the bot says back. Test any
        message at the bottom before you save.
      </p>
      <AutoResponderForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
      />
    </div>
  );
}
