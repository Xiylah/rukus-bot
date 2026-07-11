import { getAutoResponderConfig } from "@rukus/supabase";
import { AutoResponderForm } from "./AutoResponderForm";

export default async function AutoResponderPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const config = await getAutoResponderConfig(guildId);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">💬 Auto-responder</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Automatically replies to common questions like &quot;when&apos;s the next
        event?&quot; or &quot;I lost my items&quot; using keyword matching.
      </p>
      <AutoResponderForm guildId={guildId} initial={config} />
    </div>
  );
}
