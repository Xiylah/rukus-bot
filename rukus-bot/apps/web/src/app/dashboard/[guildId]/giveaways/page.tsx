import { getGiveawaysConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { GiveawaysForm } from "./GiveawaysForm";

export default async function GiveawaysPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getGiveawaysConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🎉 Giveaways</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Run giveaways with <code>/giveaway start</code>. Members enter with a
        button rather than a reaction, so the bot can check the required role
        before counting them and tell them if they don&apos;t qualify.
      </p>
      <GiveawaysForm
        guildId={guildId}
        initial={config}
        roles={options.roles}
      />
    </div>
  );
}
