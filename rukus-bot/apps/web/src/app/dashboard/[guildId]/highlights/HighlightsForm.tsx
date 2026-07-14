"use client";

import { useState, useTransition } from "react";
import type { HighlightsConfig } from "@rukus/shared";
import { formatDuration } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { saveHighlightsConfig } from "../utility-actions";

export function HighlightsForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: HighlightsConfig;
}) {
  const [config, setConfig] = useState<HighlightsConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof HighlightsConfig>(key: K, value: HighlightsConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveHighlightsConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle
          label="Enable highlights"
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />

        <div>
          <label className="label">Maximum words per member</label>
          <input
            type="number"
            className="input max-w-32"
            min={1}
            max={100}
            value={config.maxPerUser}
            onChange={(e) => set("maxPerUser", Number(e.target.value))}
          />
        </div>

        <div>
          <label className="label">
            Cooldown between DMs ({formatDuration(config.cooldownSec)})
          </label>
          <input
            type="number"
            className="input max-w-32"
            min={0}
            max={3600}
            value={config.cooldownSec}
            onChange={(e) => set("cooldownSec", Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Seconds. A busy channel saying a common word would otherwise DM
            someone once a second.
          </p>
        </div>
      </div>

      <div className="card space-y-2 text-sm text-zinc-400">
        <div className="font-medium text-white">What the bot will not do</div>
        <ul className="list-inside list-disc space-y-1">
          <li>Notify someone about their own message.</li>
          <li>
            Notify someone who can&apos;t see the channel, so a highlight can
            never leak a private channel.
          </li>
          <li>
            Notify someone who has spoken in that channel in the last 5 minutes:
            they&apos;re already reading it.
          </li>
          <li>Match a word inside another word. &quot;cat&quot; won&apos;t fire on &quot;catastrophe&quot;.</li>
        </ul>
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
