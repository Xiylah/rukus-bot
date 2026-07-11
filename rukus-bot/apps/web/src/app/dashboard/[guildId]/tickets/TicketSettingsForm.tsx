"use client";

import { useState, useTransition } from "react";
import type { TicketConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { saveTicketConfig } from "../actions";

export function TicketSettingsForm({
  guildId,
  initial,
  categories,
  channels,
  roles,
}: {
  guildId: string;
  initial: TicketConfig;
  categories: Option[];
  channels: Option[];
  roles: Option[];
}) {
  const [config, setConfig] = useState<TicketConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function update<K extends keyof TicketConfig>(key: K, value: TicketConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }
  function updatePanel<K extends keyof TicketConfig["panel"]>(
    key: K,
    value: TicketConfig["panel"][K],
  ) {
    setConfig((c) => ({ ...c, panel: { ...c.panel, [key]: value } }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveTicketConfig(guildId, config);
      setMsg(
        res.ok
          ? { ok: true, text: "Saved. Changes apply within ~15s in the bot." }
          : { ok: false, text: res.error },
      );
    });
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <Toggle
          label="Enable tickets"
          hint="Master switch for the whole feature."
          checked={config.enabled}
          onChange={(v) => update("enabled", v)}
        />
      </div>

      <div className="card space-y-4">
        <Select
          label="Ticket category"
          hint="New ticket channels are created under this category."
          value={config.categoryId}
          onChange={(v) => update("categoryId", v)}
          options={categories}
          placeholder="— no category —"
        />
        <Select
          label="Transcript channel"
          hint="Closed-ticket transcripts get posted here."
          value={config.transcriptChannelId}
          onChange={(v) => update("transcriptChannelId", v)}
          options={channels}
          prefix="#"
          placeholder="— don't post transcripts —"
        />
        <MultiSelect
          label="Support roles"
          hint="These roles can see, claim, and close tickets."
          values={config.supportRoleIds}
          onChange={(v) => update("supportRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="No support roles — only admins can handle tickets"
        />
        <div>
          <label className="label">Max open tickets per user</label>
          <input
            type="number"
            min={0}
            max={50}
            className="input"
            value={config.maxOpenPerUser}
            onChange={(e) => update("maxOpenPerUser", Number(e.target.value) || 0)}
          />
          <p className="mt-1 text-xs text-zinc-500">0 = unlimited.</p>
        </div>
        <div>
          <label className="label">Welcome message</label>
          <textarea
            className="input min-h-20"
            value={config.welcomeMessage}
            onChange={(e) => update("welcomeMessage", e.target.value)}
          />
        </div>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Panel appearance</div>
        <div>
          <label className="label">Panel title</label>
          <input
            className="input"
            value={config.panel.title}
            onChange={(e) => updatePanel("title", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Panel description</label>
          <textarea
            className="input min-h-20"
            value={config.panel.description}
            onChange={(e) => updatePanel("description", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Button label</label>
          <input
            className="input"
            value={config.panel.buttonLabel}
            onChange={(e) => updatePanel("buttonLabel", e.target.value)}
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
