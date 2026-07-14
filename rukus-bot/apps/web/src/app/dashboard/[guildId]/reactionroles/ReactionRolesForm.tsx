"use client";

import { useState, useTransition } from "react";
import {
  MODE_HELP,
  reactionLegend,
  type ButtonStyle,
  type ReactionRoleMode,
  type ReactionRolePair,
  type ReactionRolePanel,
  type ReactionRoleStyle,
  type ReactionRolesConfig,
} from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { MultiSelect, Select, type Option } from "@/components/Pickers";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveReactionRolesConfig } from "./actions";
import { PublishRrPanel } from "./PublishRrPanel";

const MODES: ReactionRoleMode[] = [
  "normal",
  "unique",
  "verify",
  "drop",
  "reversed",
  "binding",
  "limit",
  "lock",
];

const MODE_LABEL: Record<ReactionRoleMode, string> = {
  normal: "Normal - toggle on and off",
  unique: "Unique - only one of these roles at a time",
  verify: "Verify - give only, never take back",
  drop: "Drop - take the role away",
  reversed: "Reversed - reacting removes the role",
  binding: "Binding - one permanent choice",
  limit: "Limit - up to N of these roles",
  lock: "Lock - panel paused, nothing changes",
};

const STYLE_HELP: Record<ReactionRoleStyle, string> = {
  buttons:
    "Buttons under the message. Instant, impossible to fake, and the bot can tell a member exactly why a role was refused. This is the recommended choice.",
  dropdown:
    "A single dropdown. Best when you have a lot of roles: it stays tidy, and members can pick several at once.",
  reactions:
    "Classic emoji reactions, the way Carl-bot does it. Works, but members can strip the emoji, Discord rate-limits them, and the bot can never explain a refusal.",
};

function emptyPair(): ReactionRolePair {
  return { emoji: "", roleId: "", description: "" };
}

function emptyPanel(): ReactionRolePanel {
  return {
    id: `p_${Math.random().toString(36).slice(2, 8)}`,
    channelId: undefined,
    messageId: null,
    title: "Pick your roles",
    description: "Choose the roles you want below.",
    color: "#5865f2",
    mode: "normal",
    style: "buttons",
    maxRoles: 1,
    buttonStyle: "secondary",
    placeholder: "Select a role",
    requiredRoleIds: [],
    blockedRoleIds: [],
    pairs: [emptyPair()],
  };
}

export function ReactionRolesForm({
  guildId,
  initial,
  channels,
  roles,
  grantableRoles,
}: {
  guildId: string;
  initial: ReactionRolesConfig;
  channels: Option[];
  roles: Option[];
  grantableRoles: Option[];
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [panels, setPanels] = useState<ReactionRolePanel[]>(initial.panels);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initial.panels[0]?.id,
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pi = panels.findIndex((p) => p.id === selectedId);
  const panel = pi >= 0 ? panels[pi] : undefined;

  const roleName = (id: string) =>
    roles.find((r) => r.id === id)?.name ?? "unknown-role";
  const roleNames: Record<string, string> = Object.fromEntries(
    roles.map((r) => [r.id, r.name]),
  );

  function update(patch: Partial<ReactionRolePanel>) {
    setPanels((ps) => ps.map((p, i) => (i === pi ? { ...p, ...patch } : p)));
  }
  function updatePair(index: number, patch: Partial<ReactionRolePair>) {
    if (!panel) return;
    update({
      pairs: panel.pairs.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });
  }
  function addPanel() {
    const p = emptyPanel();
    setPanels((ps) => [...ps, p]);
    setSelectedId(p.id);
  }
  function removePanel() {
    setPanels((ps) => {
      const next = ps.filter((p) => p.id !== selectedId);
      setSelectedId(next[0]?.id);
      return next;
    });
  }

  /** Shared by the Save button and the publish card, which saves first. */
  async function persist(): Promise<boolean> {
    const res = await saveReactionRolesConfig(guildId, { enabled, panels });
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    return res.ok;
  }

  function onSave() {
    setMsg(null);
    startTransition(() => void persist());
  }

  // The preview mirrors what the shared payload builder will produce.
  const previewBody = panel
    ? [
        panel.description.trim(),
        panel.style === "reactions" && panel.pairs.length > 0
          ? reactionLegend(panel, roleNames).replace(
              /<@&(\d+)>/g,
              (_m, id: string) => `@${roleName(id)}`,
            )
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  return (
    <div className="space-y-5">
      <div className="card">
        <Toggle
          label="Enable reaction roles"
          hint="Turn this off to freeze every panel at once without deleting them."
          checked={enabled}
          onChange={setEnabled}
        />
      </div>

      <div className="card">
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || undefined)}
          >
            {panels.length === 0 && (
              <option value="">No panels yet, add one →</option>
            )}
            {panels.map((p, i) => (
              <option key={p.id} value={p.id}>
                {i + 1} | {p.title} ({p.style}, {p.mode})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary whitespace-nowrap"
            onClick={addPanel}
            disabled={panels.length >= 50}
          >
            + New panel
          </button>
        </div>
      </div>

      {panel && pi >= 0 && (
        <>
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Panel id <code className="rounded bg-panel px-1">{panel.id}</code>
                {panel.messageId ? " | live in Discord" : " | not posted yet"}
              </span>
              <button
                type="button"
                className="text-sm text-red-400 hover:underline"
                onClick={removePanel}
              >
                Delete this panel
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Panel title</label>
                <input
                  className="input"
                  maxLength={256}
                  value={panel.title}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </div>
              <Select
                label="Channel"
                hint="Where the panel message lives."
                value={panel.channelId}
                onChange={(v) => update({ channelId: v })}
                options={channels}
                prefix="#"
                placeholder="Pick a channel"
              />
            </div>

            <div>
              <label className="label">Description</label>
              <textarea
                className="input min-h-24"
                maxLength={4000}
                value={panel.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Embed color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 cursor-pointer rounded border border-edge bg-panel"
                  value={panel.color}
                  onChange={(e) => update({ color: e.target.value })}
                />
                <span className="text-sm text-zinc-400">{panel.color}</span>
              </div>
            </div>
          </div>

          {/* How it looks and how it behaves */}
          <div className="card space-y-4">
            <div className="font-medium text-white">Behaviour</div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Style</label>
                <select
                  className="input"
                  value={panel.style}
                  onChange={(e) =>
                    update({ style: e.target.value as ReactionRoleStyle })
                  }
                >
                  <option value="buttons">Buttons (recommended)</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="reactions">Reactions (classic)</option>
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  {STYLE_HELP[panel.style]}
                </p>
              </div>

              <div>
                <label className="label">Mode</label>
                <select
                  className="input"
                  value={panel.mode}
                  onChange={(e) =>
                    update({ mode: e.target.value as ReactionRoleMode })
                  }
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  {MODE_HELP[panel.mode]}
                </p>
              </div>
            </div>

            {panel.mode === "limit" && (
              <div>
                <label className="label">Maximum roles from this panel</label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  className="input max-w-24"
                  value={panel.maxRoles}
                  onChange={(e) =>
                    update({ maxRoles: Number(e.target.value) || 1 })
                  }
                />
              </div>
            )}

            {panel.style === "buttons" && (
              <div>
                <label className="label">Button color</label>
                <select
                  className="input max-w-48"
                  value={panel.buttonStyle}
                  onChange={(e) =>
                    update({ buttonStyle: e.target.value as ButtonStyle })
                  }
                >
                  <option value="secondary">Grey</option>
                  <option value="primary">Blurple</option>
                  <option value="success">Green</option>
                  <option value="danger">Red</option>
                </select>
              </div>
            )}

            {panel.style === "dropdown" && (
              <div>
                <label className="label">Dropdown placeholder</label>
                <input
                  className="input"
                  maxLength={150}
                  value={panel.placeholder}
                  onChange={(e) => update({ placeholder: e.target.value })}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Picking an option toggles that role, so members can undo a
                  choice by picking it again.
                </p>
              </div>
            )}

            <MultiSelect
              label="Members must have one of these roles"
              hint="Leave empty to let everyone use the panel."
              values={panel.requiredRoleIds}
              onChange={(v) => update({ requiredRoleIds: v })}
              options={roles}
              prefix="@"
              emptyText="Everyone"
            />
            <MultiSelect
              label="Members with any of these roles are refused"
              hint="Handy for a Muted role, so punished members can't self-role around it."
              values={panel.blockedRoleIds}
              onChange={(v) => update({ blockedRoleIds: v })}
              options={roles}
              prefix="@"
              emptyText="Nobody"
            />
          </div>

          {/* Emoji + role pairs */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-medium text-white">Roles on this panel</div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => update({ pairs: [...panel.pairs, emptyPair()] })}
                disabled={panel.pairs.length >= 25}
              >
                + Add role
              </button>
            </div>

            {panel.pairs.length === 0 && (
              <p className="text-sm text-zinc-500">
                Add at least one role, or there is nothing to pick.
              </p>
            )}

            {panel.pairs.map((pair, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-3 rounded-lg border border-edge p-3 sm:grid-cols-[6rem_1fr_1fr_auto]"
              >
                <div>
                  <label className="label">Emoji</label>
                  <input
                    className="input"
                    maxLength={64}
                    placeholder="🎮"
                    value={pair.emoji}
                    onChange={(e) => updatePair(i, { emoji: e.target.value })}
                  />
                </div>
                <Select
                  label="Role"
                  value={pair.roleId || undefined}
                  onChange={(v) => updatePair(i, { roleId: v ?? "" })}
                  options={grantableRoles}
                  prefix="@"
                  placeholder="Pick a role"
                />
                <div>
                  <label className="label">Label</label>
                  <input
                    className="input"
                    maxLength={100}
                    placeholder={
                      pair.roleId ? roleName(pair.roleId) : "Shown on the button"
                    }
                    value={pair.description}
                    onChange={(e) =>
                      updatePair(i, { description: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="text-sm text-red-400 hover:underline"
                    onClick={() =>
                      update({ pairs: panel.pairs.filter((_, j) => j !== i) })
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <p className="text-xs text-zinc-500">
              Emoji can be a normal one (🎮) or a custom server emoji written as{" "}
              <code className="rounded bg-panel px-1">
                {"<:name:123456789012345678>"}
              </code>
              . Reaction panels need one. Button panels can use an emoji, a
              label, or both. Only roles BELOW the bot&apos;s own role can be
              handed out.
            </p>
          </div>

          {/* Preview */}
          <div className="card space-y-3">
            <div className="font-medium text-white">Preview</div>
            <DiscordPreview
              color={panel.color}
              title={panel.title}
              description={previewBody}
              buttons={
                panel.style === "buttons"
                  ? panel.pairs.map((p) => ({
                      emoji: p.emoji || undefined,
                      label:
                        p.description ||
                        (p.emoji ? "" : p.roleId ? roleName(p.roleId) : "Role"),
                    }))
                  : undefined
              }
              select={
                panel.style === "dropdown"
                  ? {
                      placeholder: panel.placeholder,
                      options: panel.pairs.map((p) => ({
                        emoji: p.emoji || undefined,
                        label:
                          p.description ||
                          (p.roleId ? roleName(p.roleId) : "Role"),
                      })),
                    }
                  : undefined
              }
            />
            {panel.style === "reactions" && (
              <p className="text-xs text-zinc-500">
                The bot adds each emoji to the message as a reaction when you
                publish.
              </p>
            )}
          </div>

          <PublishRrPanel
            guildId={guildId}
            panelId={panel.id}
            channelId={panel.channelId}
            posted={!!panel.messageId}
            save={persist}
          />
        </>
      )}

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
