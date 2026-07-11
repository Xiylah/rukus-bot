"use client";

import { useState, useTransition } from "react";
import type { WelcomeConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { saveWelcomeConfig } from "../actions";

export function WelcomeForm({
  guildId,
  initial,
  channels,
  roles,
}: {
  guildId: string;
  initial: WelcomeConfig;
  channels: Option[];
  roles: Option[];
}) {
  const [config, setConfig] = useState<WelcomeConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof WelcomeConfig>(key: K, value: WelcomeConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveWelcomeConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">Welcome messages</div>
        <Toggle
          label="Enable welcome messages"
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <Select
          label="Welcome channel"
          value={config.channelId}
          onChange={(v) => set("channelId", v)}
          options={channels}
          prefix="#"
        />
        <div>
          <label className="label">Welcome message</label>
          <textarea
            className="input min-h-20"
            value={config.message}
            onChange={(e) => set("message", e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Preview: {config.message
              .replace(/\{user\}/gi, "@NewMember")
              .replace(/\{username\}/gi, "NewMember")
              .replace(/\{server\}/gi, "Your Server")
              .replace(/\{memberCount\}/gi, "1234")}
          </p>
        </div>
        <Toggle
          label="Also send a welcome DM"
          hint="Sends the message below directly to the new member (skipped if their DMs are closed)."
          checked={config.dmEnabled}
          onChange={(v) => set("dmEnabled", v)}
        />
        {config.dmEnabled && (
          <div>
            <label className="label">DM message</label>
            <textarea
              className="input min-h-16"
              value={config.dmMessage}
              onChange={(e) => set("dmMessage", e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Auto-roles on join</div>
        <MultiSelect
          label="Roles given to every new member"
          hint="Applied the moment someone joins, even if welcome messages are off."
          values={config.joinRoleIds}
          onChange={(v) => set("joinRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="No auto-roles"
        />
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Leave messages</div>
        <Toggle
          label="Enable leave messages"
          checked={config.leaveEnabled}
          onChange={(v) => set("leaveEnabled", v)}
        />
        <Select
          label="Leave channel"
          value={config.leaveChannelId}
          onChange={(v) => set("leaveChannelId", v)}
          options={channels}
          prefix="#"
        />
        <div>
          <label className="label">Leave message</label>
          <textarea
            className="input min-h-16"
            value={config.leaveMessage}
            onChange={(e) => set("leaveMessage", e.target.value)}
          />
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
