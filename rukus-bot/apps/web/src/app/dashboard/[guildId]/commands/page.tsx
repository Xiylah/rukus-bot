import { getCustomCommandsConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { CustomCommandsForm } from "./CustomCommandsForm";

export default async function CustomCommandsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getCustomCommandsConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">⌨️ Custom Commands</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Make your own commands like{" "}
        <code className="rounded bg-panel px-1">!codes</code>. Write the response
        once and the bot answers it forever, so staff stop retyping the same
        thing.
      </p>
      <CustomCommandsForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
      />
    </div>
  );
}
