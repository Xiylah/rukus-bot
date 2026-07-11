"use client";

import { useState, useTransition } from "react";
import type { TicketConfig, TicketType } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveTicketConfig } from "../actions";

/** Short unique id for a new ticket type (client-side is fine here). */
function shortId(): string {
  return `t_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyType(): TicketType {
  return {
    id: shortId(),
    label: "New ticket type",
    description: "",
    emoji: "🎫",
    nameTemplate: "ticket-{count}",
    categoryId: undefined,
    welcomeMessage: undefined,
  };
}

export function TicketSettingsForm({
  guildId,
  initial,
  categories,
  channels,
  roles,
  forms,
}: {
  guildId: string;
  initial: TicketConfig;
  categories: Option[];
  channels: Option[];
  roles: Option[];
  forms: Option[];
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
  function updateType(idx: number, patch: Partial<TicketType>) {
    setConfig((c) => ({
      ...c,
      types: c.types.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
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
          placeholder="No category"
        />
        <Select
          label="Transcript channel"
          hint="Closed-ticket transcripts get posted here."
          value={config.transcriptChannelId}
          onChange={(v) => update("transcriptChannelId", v)}
          options={channels}
          prefix="#"
          placeholder="Don't post transcripts"
        />
        <MultiSelect
          label="Support roles"
          hint="These roles can see, claim, and close tickets."
          values={config.supportRoleIds}
          onChange={(v) => update("supportRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="No support roles - only admins can handle tickets"
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
        <div>
          <div className="font-medium text-white">
            Ticket types ({config.types.length || "1 default"})
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            With 2+ types the panel becomes a dropdown (like Ticket Tool), and
            each type names its channels so staff instantly know what a ticket
            is about. <code className="rounded bg-panel px-1">{"{count}"}</code>{" "}
            becomes the ticket number - e.g.{" "}
            <code className="rounded bg-panel px-1">mute-appeal-{"{count}"}</code>{" "}
            → <code className="rounded bg-panel px-1">mute-appeal-0007</code>.
          </p>
        </div>

        {config.types.map((type, ti) => (
          <div
            key={type.id}
            className="space-y-3 rounded-md border border-edge bg-panel p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Type: {type.id}</span>
              <button
                type="button"
                className="text-sm text-red-400 hover:underline"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    types: c.types.filter((_, i) => i !== ti),
                  }))
                }
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Emoji</label>
                <input
                  className="input"
                  maxLength={8}
                  value={type.emoji}
                  onChange={(e) => updateType(ti, { emoji: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Name (shown in the dropdown)</label>
                <input
                  className="input"
                  maxLength={80}
                  value={type.label}
                  onChange={(e) => updateType(ti, { label: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Dropdown description (optional)</label>
              <input
                className="input"
                maxLength={100}
                placeholder="Small text under the option, e.g. “Appeal a mute”"
                value={type.description}
                onChange={(e) => updateType(ti, { description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Channel name template</label>
                <input
                  className="input"
                  maxLength={90}
                  value={type.nameTemplate}
                  onChange={(e) =>
                    updateType(ti, { nameTemplate: e.target.value })
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">
                  {"{count}"} = ticket number, {"{type}"} = this type&apos;s name.
                </p>
              </div>
              <Select
                label="Category override (optional)"
                value={type.categoryId}
                onChange={(v) => updateType(ti, { categoryId: v })}
                options={categories}
                placeholder="Use the default category"
              />
            </div>
            <div>
              <label className="label">Welcome message override (optional)</label>
              <textarea
                className="input min-h-16"
                placeholder="Leave blank to use the default welcome message."
                value={type.welcomeMessage ?? ""}
                onChange={(e) =>
                  updateType(ti, {
                    welcomeMessage: e.target.value || undefined,
                  })
                }
              />
            </div>
            <Select
              label="Ask a form before opening (optional)"
              hint="The member fills these questions first; their answers get posted in the ticket for staff. Build forms on the Forms page."
              value={type.formId}
              onChange={(v) => updateType(ti, { formId: v })}
              options={forms}
              placeholder="No form, open the ticket right away"
            />
          </div>
        ))}

        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() =>
            setConfig((c) => ({ ...c, types: [...c.types, emptyType()] }))
          }
          disabled={config.types.length >= 25}
        >
          + Add ticket type
        </button>
        <p className="text-xs text-zinc-500">
          After changing types, re-run{" "}
          <code className="rounded bg-panel px-1">/ticket panel</code> in Discord
          so the posted panel picks up the new options.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Panel appearance</div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-4">
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
              <label className="label">Button label / dropdown placeholder</label>
              <input
                className="input"
                value={config.panel.buttonLabel}
                onChange={(e) => updatePanel("buttonLabel", e.target.value)}
              />
              <p className="mt-1 text-xs text-zinc-500">
                Button text with one ticket type; placeholder text with several.
              </p>
            </div>
            <div>
              <label className="label">Embed color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 cursor-pointer rounded border border-edge bg-panel"
                  value={config.panel.color}
                  onChange={(e) => updatePanel("color", e.target.value)}
                />
                <span className="text-sm text-zinc-400">{config.panel.color}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Live preview</label>
            {config.types.length <= 1 ? (
              <DiscordPreview
                color={config.panel.color}
                title={config.panel.title}
                description={config.panel.description}
                buttons={[
                  {
                    emoji: config.types[0]?.emoji ?? "🎫",
                    label: config.panel.buttonLabel,
                  },
                ]}
              />
            ) : (
              <DiscordPreview
                color={config.panel.color}
                title={config.panel.title}
                description={config.panel.description}
                select={{
                  placeholder: config.panel.buttonLabel,
                  options: config.types.map((t) => ({
                    emoji: t.emoji,
                    label: t.label,
                    description: t.description || undefined,
                  })),
                }}
              />
            )}
            <p className="mt-1 text-xs text-zinc-500">
              This is what /ticket panel will post. It updates as you type.
            </p>
          </div>
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
