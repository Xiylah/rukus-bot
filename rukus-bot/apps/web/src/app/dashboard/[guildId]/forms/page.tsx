import { getFormsConfig } from "@rukus/supabase";
import { FormsSettings } from "./FormsSettings";

export default async function FormsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const config = await getFormsConfig(guildId);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📝 Forms</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Build application forms (max 5 questions each — a Discord limit). After
        saving, run <code className="rounded bg-panel px-1">/form panel</code> in
        Discord to post the buttons.
      </p>
      <FormsSettings guildId={guildId} initial={config} />
    </div>
  );
}
