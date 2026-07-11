import { getModerationConfig } from "@rukus/supabase";
import { ModerationForm } from "./ModerationForm";

// Cloudflare Pages runs on the edge runtime.
export const runtime = "edge";

export default async function ModerationPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const config = await getModerationConfig(guildId);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🛡️ Moderation</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Basic automod ported from the original bot. Warn/mute/ban tools are
        coming in a later update.
      </p>
      <ModerationForm guildId={guildId} initial={config} />
    </div>
  );
}
