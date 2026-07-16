"use client";

import { useState, useTransition } from "react";
import type { RaidConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, type Option } from "@/components/Pickers";
import { saveRaidConfig } from "./actions";

const ACTION_HELP: Record<RaidConfig["action"], string> = {
  "alert-only": "Just post an alert. Nothing is locked or removed. Safest starting point.",
  lockdown: "Lock every text channel so only staff can post, then post an alert.",
  "kick-new": "Kick the accounts that joined during the spike.",
  quarantine:
    "Add the Verification quarantine role to the accounts that joined during the spike.",
};

export function RaidForm({
  guildId,
  initial,
  channels,
}: {
  guildId: string;
  initial: RaidConfig;
  channels: Option[];
}) {
  const [config, setConfig] = useState<RaidConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof RaidConfig>(key: K, value: RaidConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveRaidConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">Basics</div>
        <Toggle
          label="Enable raid protection"
          hint="Watches the join rate. Off means join spikes are ignored."
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        {!config.enabled && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Raid protection is off, so nothing below is running.
          </p>
        )}
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Trigger</div>
        <p className="text-sm text-zinc-400">
          Raid mode trips when this many members join within the window.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Joins</label>
            <input
              type="number"
              min={2}
              max={100}
              className="input max-w-32"
              value={config.joinRateCount}
              onChange={(e) =>
                set("joinRateCount", Math.min(100, Math.max(2, Number(e.target.value) || 2)))
              }
            />
          </div>
          <div>
            <label className="label">Within (seconds)</label>
            <input
              type="number"
              min={5}
              max={600}
              className="input max-w-32"
              value={config.joinRateSeconds}
              onChange={(e) =>
                set("joinRateSeconds", Math.min(600, Math.max(5, Number(e.target.value) || 5)))
              }
            />
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          Currently: <strong>{config.joinRateCount}</strong> joins in{" "}
          <strong>{config.joinRateSeconds}s</strong> trips raid mode.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Response</div>
        <div>
          <label className="label">When a raid is detected</label>
          <select
            className="input"
            value={config.action}
            onChange={(e) => set("action", e.target.value as RaidConfig["action"])}
          >
            <option value="alert-only">Alert only</option>
            <option value="lockdown">Lock down the server</option>
            <option value="kick-new">Kick the new accounts</option>
            <option value="quarantine">Quarantine the new accounts</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">{ACTION_HELP[config.action]}</p>
          {config.action === "quarantine" && (
            <p className="mt-1 text-xs text-amber-400">
              Uses the quarantine role from the <strong>Verification</strong> page.
              Set one there or nobody gets quarantined.
            </p>
          )}
        </div>

        <Select
          label="Alert channel"
          hint="Where raid alerts are posted (on and off). A staff-only channel is ideal."
          value={config.alertChannelId}
          onChange={(v) => set("alertChannelId", v)}
          options={channels}
          prefix="#"
          placeholder="None"
        />

        <div>
          <label className="label">
            Auto-lift after:{" "}
            {config.autoLiftMinutes === 0 ? "manual only" : `${config.autoLiftMinutes} min`}
          </label>
          <input
            type="range"
            min={0}
            max={1440}
            step={5}
            className="w-full"
            value={config.autoLiftMinutes}
            onChange={(e) => set("autoLiftMinutes", Number(e.target.value))}
          />
          <div className="flex justify-between text-xs text-zinc-500">
            <span>0 = lift manually with /raid lift</span>
            <span>1440 = 24h</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            After this long, raid mode lifts itself and any channels it locked are
            reopened. A false alarm won&apos;t wall off the server until a human notices.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-green-400" : "text-red-400"}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
