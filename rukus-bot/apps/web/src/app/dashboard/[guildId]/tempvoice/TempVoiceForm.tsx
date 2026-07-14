"use client";

import { useState, useTransition } from "react";
import type { TempVoiceConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, type Option } from "@/components/Pickers";
import { saveTempVoiceConfig } from "./actions";

export function TempVoiceForm({
  guildId,
  initial,
  voiceChannels,
  categories,
}: {
  guildId: string;
  initial: TempVoiceConfig;
  voiceChannels: Option[];
  categories: Option[];
}) {
  const [config, setConfig] = useState<TempVoiceConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof TempVoiceConfig>(
    key: K,
    value: TempVoiceConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveTempVoiceConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  const preview = config.nameTemplate
    .replace(/\{user\}/gi, "Ada")
    .replace(/\{username\}/gi, "Ada")
    .replace(/\{count\}/gi, "3");

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">Join to create</div>
        <Toggle
          label="Enable temporary voice channels"
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <Select
          label="Lobby channel"
          hint="The voice channel members join to get one of their own. They are moved out of it immediately."
          value={config.lobbyChannelId}
          onChange={(v) => set("lobbyChannelId", v)}
          options={voiceChannels}
          prefix="🔊 "
        />
        <Select
          label="Category"
          hint="Where the new channels are created. Leave empty to use the lobby's own category."
          value={config.categoryId}
          onChange={(v) => set("categoryId", v)}
          options={categories}
        />
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">The new channel</div>
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={config.nameTemplate}
            onChange={(e) => set("nameTemplate", e.target.value)}
            maxLength={90}
          />
          <p className="mt-1 text-xs text-zinc-500">
            {"{username}"} is the member&apos;s name, {"{count}"} is how many temp
            channels exist.
          </p>
          <div className="mt-2 rounded-md border border-edge bg-black/20 p-3 text-sm text-zinc-300">
            🔊 {preview || <span className="text-zinc-600">Nothing to preview</span>}
          </div>
        </div>
        <div>
          <label className="label">User limit</label>
          <input
            className="input"
            type="number"
            min={0}
            max={99}
            value={config.userLimit}
            onChange={(e) => set("userLimit", Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-zinc-500">
            0 means no limit. The owner can change their own channel&apos;s limit
            afterwards.
          </p>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="font-medium text-white">What the owner gets</div>
        <p className="text-sm text-zinc-400">
          Whoever created the channel can rename it, set its user limit, and move
          or mute people inside it. They cannot edit its permissions, so they
          cannot hand themselves anything the server did not give them.
        </p>
        <p className="text-sm text-zinc-400">
          The bot needs <strong>Manage Channels</strong> and{" "}
          <strong>Move Members</strong>. Without both it will not create
          anything, rather than stranding members in the lobby.
        </p>
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
