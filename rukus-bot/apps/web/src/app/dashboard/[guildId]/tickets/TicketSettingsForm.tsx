"use client";

import { useState, useTransition } from "react";
import type { TicketConfig } from "@rukus/shared";
import { saveTicketConfig } from "../actions";

export function TicketSettingsForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: TicketConfig;
}) {
  const [config, setConfig] = useState<TicketConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Support roles are edited as a comma-separated list of IDs for now.
  const [supportRolesText, setSupportRolesText] = useState(
    initial.supportRoleIds.join(", "),
  );

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
    const supportRoleIds = supportRolesText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{17,20}$/.test(s));

    const payload: TicketConfig = { ...config, supportRoleIds };
    setMsg(null);
    startTransition(async () => {
      const res = await saveTicketConfig(guildId, payload);
      setMsg(
        res.ok
          ? { ok: true, text: "Saved. Changes apply within ~15s in the bot." }
          : { ok: false, text: res.error },
      );
    });
  }

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between">
        <div>
          <div className="font-medium text-white">Enable tickets</div>
          <div className="text-sm text-zinc-400">
            Master switch for the whole feature.
          </div>
        </div>
        <button
          type="button"
          onClick={() => update("enabled", !config.enabled)}
          className={`h-6 w-11 rounded-full transition-colors ${
            config.enabled ? "bg-blurple" : "bg-edge"
          }`}
          aria-pressed={config.enabled}
        >
          <span
            className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform ${
              config.enabled ? "translate-x-[22px]" : ""
            }`}
          />
        </button>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">Ticket category ID</label>
          <input
            className="input"
            placeholder="Category channel ID new tickets are created under"
            value={config.categoryId ?? ""}
            onChange={(e) => update("categoryId", e.target.value || undefined)}
          />
        </div>
        <div>
          <label className="label">Transcript channel ID</label>
          <input
            className="input"
            placeholder="Where closed-ticket transcripts get posted"
            value={config.transcriptChannelId ?? ""}
            onChange={(e) =>
              update("transcriptChannelId", e.target.value || undefined)
            }
          />
        </div>
        <div>
          <label className="label">Support role IDs</label>
          <input
            className="input"
            placeholder="Comma-separated role IDs, e.g. 123..., 456..."
            value={supportRolesText}
            onChange={(e) => setSupportRolesText(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Enable Developer Mode in Discord, then right-click a channel/role →
            Copy ID.
          </p>
        </div>
        <div>
          <label className="label">Max open tickets per user</label>
          <input
            type="number"
            min={0}
            max={50}
            className="input"
            value={config.maxOpenPerUser}
            onChange={(e) =>
              update("maxOpenPerUser", Number(e.target.value) || 0)
            }
          />
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
