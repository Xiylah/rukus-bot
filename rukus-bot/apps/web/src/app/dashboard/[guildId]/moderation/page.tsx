import { getModerationConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { ModerationForm } from "./ModerationForm";

export default async function ModerationPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getModerationConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🛡️ Moderation</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Automod, anti-spam and the warn-escalation ladder. Staff drive
        warn/mute/kick/ban from the bot commands; the record lives under Cases.
      </p>
      <ModerationForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
      />
    </div>
  );
}
