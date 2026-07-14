"use client";

import { useState, useTransition } from "react";
import type { StarboardConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { saveStarboardConfig } from "../actions";

export function StarboardForm({
  guildId,
  initial,
  channels,
  roles,
}: {
  guildId: string;
  initial: StarboardConfig;
  channels: Option[];
  roles: Option[];
}) {
  const [config, setConfig] = useState<StarboardConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof StarboardConfig>(
    key: K,
    value: StarboardConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveStarboardConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">The board</div>
        <Toggle
          label="Enable starboard"
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <Select
          label="Starboard channel"
          hint="Where starred messages are mirrored."
          value={config.channelId}
          onChange={(v) => set("channelId", v)}
          options={channels}
          prefix="#"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Star emoji</label>
            <input
              className="input"
              value={config.emoji}
              onChange={(e) => set("emoji", e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">
              A normal emoji, or a custom one pasted as {"<:name:123…>"}.
            </p>
          </div>
          <div>
            <label className="label">Stars needed</label>
            <input
              className="input"
              type="number"
              min={1}
              max={100}
              value={config.threshold}
              onChange={(e) => set("threshold", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Embed color</label>
            <input
              className="input h-10 p-1"
              type="color"
              value={config.embedColor}
              onChange={(e) => set("embedColor", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Rules</div>
        <Toggle
          label="Count self-stars"
          hint="Off by default: letting people star their own message makes the board trivial to game."
          checked={config.allowSelfStar}
          onChange={(v) => set("allowSelfStar", v)}
        />
        <Toggle
          label="Allow messages from NSFW channels"
          hint="The starboard channel is usually not marked NSFW, so mirroring into it would be a rule break."
          checked={config.allowNsfw}
          onChange={(v) => set("allowNsfw", v)}
        />
        <Toggle
          label="Show a jump link to the original"
          checked={config.showJumpLink}
          onChange={(v) => set("showJumpLink", v)}
        />
        <MultiSelect
          label="Ignored channels"
          hint="Messages here are never starred. Threads inherit their parent channel's rule."
          values={config.ignoreChannelIds}
          onChange={(v) => set("ignoreChannelIds", v)}
          options={channels}
          prefix="#"
          emptyText="No ignored channels"
        />
        <MultiSelect
          label="Ignored roles"
          hint="Messages from members with these roles are never starred."
          values={config.ignoreRoleIds}
          onChange={(v) => set("ignoreRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="No ignored roles"
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
