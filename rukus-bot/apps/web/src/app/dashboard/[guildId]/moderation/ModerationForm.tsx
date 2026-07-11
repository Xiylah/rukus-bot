"use client";

import { useState, useTransition } from "react";
import type { ModerationConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, type Option } from "@/components/Pickers";
import { saveModerationConfig } from "../actions";

export function ModerationForm({
  guildId,
  initial,
  channels,
}: {
  guildId: string;
  initial: ModerationConfig;
  channels: Option[];
}) {
  const [config, setConfig] = useState<ModerationConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveModerationConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle
          label="Drug/substance filter"
          hint="Delete messages mentioning drug terms and post a family-friendly reminder."
          checked={config.drugFilter}
          onChange={(v) => setConfig((c) => ({ ...c, drugFilter: v }))}
        />
        <Select
          label="Image-only channel"
          hint="Text-only messages posted here get deleted (e.g. a showcase channel)."
          value={config.imageOnlyChannelId}
          onChange={(v) => setConfig((c) => ({ ...c, imageOnlyChannelId: v }))}
          options={channels}
          prefix="#"
          placeholder="— disabled —"
        />
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
