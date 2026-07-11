import { getTranslationConfig } from "@rukus/supabase";
import { TranslationSettingsForm } from "./TranslationSettingsForm";

export default async function TranslationPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const config = await getTranslationConfig(guildId);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🌐 Translation</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Auto-translate foreign messages and let members react with a flag emoji
        to translate. DeepL is used when a key is set, otherwise Google.
      </p>
      <TranslationSettingsForm guildId={guildId} initial={config} />
    </div>
  );
}
