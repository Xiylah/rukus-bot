"use client";

import { useState, useTransition } from "react";
import type { AutoResponderConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { saveAutoResponderConfig } from "../actions";

export function AutoResponderForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: AutoResponderConfig;
}) {
  const [config, setConfig] = useState<AutoResponderConfig>(initial);
  const [phrasesText, setPhrasesText] = useState(
    initial.extraEventPhrases.join("\n"),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSave() {
    setMsg(null);
    const extraEventPhrases = phrasesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: AutoResponderConfig = { ...config, extraEventPhrases };
    startTransition(async () => {
      const res = await saveAutoResponderConfig(guildId, payload);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle
          label="Enable auto-responder"
          checked={config.enabled}
          onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
        />
        <div>
          <label className="label">Events channel ID</label>
          <input
            className="input"
            placeholder="Channel referenced in event replies"
            value={config.eventChannelId ?? ""}
            onChange={(e) =>
              setConfig((c) => ({ ...c, eventChannelId: e.target.value || undefined }))
            }
          />
        </div>
        <div>
          <label className="label">Support channel ID</label>
          <input
            className="input"
            placeholder="Channel referenced in lost-item replies"
            value={config.supportChannelId ?? ""}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                supportChannelId: e.target.value || undefined,
              }))
            }
          />
        </div>
        <div>
          <label className="label">Extra event phrasings (one per line)</label>
          <textarea
            className="input min-h-28"
            placeholder={"e.g.\nis the tournament today\nwhen is the raid"}
            value={phrasesText}
            onChange={(e) => setPhrasesText(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Added on top of the built-in event phrase bank to catch server-specific
            wording.
          </p>
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
