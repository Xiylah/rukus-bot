"use client";

import { useState, useTransition } from "react";
import type { TranslationConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { saveTranslationConfig } from "../actions";

const LANGS = [
  ["English", "en"], ["Spanish", "es"], ["French", "fr"], ["Portuguese", "pt"],
  ["German", "de"], ["Italian", "it"], ["Russian", "ru"], ["Japanese", "ja"],
] as const;

export function TranslationSettingsForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: TranslationConfig;
}) {
  const [config, setConfig] = useState<TranslationConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveTranslationConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle
          label="Auto-translate messages"
          hint="Reply with a translation when a message isn't in the target language."
          checked={config.autoTranslate}
          onChange={(v) => setConfig((c) => ({ ...c, autoTranslate: v }))}
        />
        <Toggle
          label="Flag-reaction translations"
          hint="React to a message with a country flag to translate it."
          checked={config.flagReactions}
          onChange={(v) => setConfig((c) => ({ ...c, flagReactions: v }))}
        />
        <div>
          <label className="label">Target language (for auto-translate)</label>
          <select
            className="input"
            value={config.targetLang}
            onChange={(e) =>
              setConfig((c) => ({ ...c, targetLang: e.target.value }))
            }
          >
            {LANGS.map(([name, code]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-green-400" : "text-red-400"}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
