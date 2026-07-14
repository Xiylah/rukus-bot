import { getTempVoiceConfig } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import {
  CHANNEL_TYPE,
  categoryChannels,
  fetchGuildChannels,
} from "@/lib/discord";
import type { Option } from "@/components/Pickers";
import { TempVoiceForm } from "./TempVoiceForm";

export default async function TempVoicePage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);

  const [config, allChannels] = await Promise.all([
    getTempVoiceConfig(guildId),
    fetchGuildChannels(guildId),
  ]);

  // loadGuildOptions only surfaces TEXT channels, and the lobby has to be a
  // voice channel, so the list is built here rather than by widening a helper
  // every other page depends on.
  const voiceChannels: Option[] = allChannels
    .filter((c) => c.type === CHANNEL_TYPE.voice)
    .map((c) => ({ id: c.id, name: c.name }));

  const categories: Option[] = categoryChannels(allChannels).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🔊 Temporary voice</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Joining the lobby channel gives a member their own voice channel, and
        moves them straight into it. When the last person leaves, it disappears.
      </p>
      <TempVoiceForm
        guildId={guildId}
        initial={config}
        voiceChannels={voiceChannels}
        categories={categories}
      />
    </div>
  );
}
