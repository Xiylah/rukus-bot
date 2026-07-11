import { getFormsConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { FormsSettings } from "./FormsSettings";

export default async function FormsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getFormsConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📝 Forms</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Build application forms (max 5 questions each — a Discord limit). After
        saving, run <code className="rounded bg-panel px-1">/form panel</code> in
        Discord to post the buttons.
      </p>
      <FormsSettings
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
      />
    </div>
  );
}
