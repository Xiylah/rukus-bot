import { getTranslationConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { TranslationSettingsForm } from "./TranslationSettingsForm";

export default async function TranslationPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getTranslationConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🌐 Translation</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Auto-translate foreign messages and let members react with a flag emoji
        to translate. If the bot is translating things it shouldn&apos;t, use the
        tester at the bottom to see exactly why.
      </p>
      <TranslationSettingsForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
      />
    </div>
  );
}
