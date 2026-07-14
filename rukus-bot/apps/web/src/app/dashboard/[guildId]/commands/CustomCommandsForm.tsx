"use client";

import { useState, useTransition } from "react";
import type {
  CustomCommandsConfig,
  CustomCommand,
  CustomResponseMode,
} from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { MultiSelect, type Option } from "@/components/Pickers";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveCustomCommandsConfig } from "../actions";

function emptyCommand(): CustomCommand {
  return {
    id: `c_${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    name: "newcommand",
    aliases: [],
    response: "Your response here.",
    responseMode: "button",
    buttonLabel: "Show me",
    deleteAfterSec: 30,
    useEmbed: true,
    embedTitle: "",
    embedColor: "#5865f2",
    deleteTrigger: false,
    channelIds: [],
    allowedRoleIds: [],
    cooldownSec: 3,
    uses: 0,
    tagscript: false,
  };
}

const MODE_HELP: Record<CustomResponseMode, string> = {
  button:
    "The bot posts a button. Clicking it shows the response ONLY to the person who clicked (Discord only allows private replies to a click, not to a typed message). Several people can each click for their own copy.",
  dm: "The bot DMs the response privately and reacts 📬. If their DMs are closed it reacts ❌ and says so.",
  autodelete:
    "The bot replies in the channel, then deletes both the reply and their command after a few seconds.",
  public: "An ordinary public reply that stays in the channel.",
};

export function CustomCommandsForm({
  guildId,
  initial,
  channels,
  roles,
}: {
  guildId: string;
  initial: CustomCommandsConfig;
  channels: Option[];
  roles: Option[];
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [prefix, setPrefix] = useState(initial.prefix);
  const [commands, setCommands] = useState<CustomCommand[]>(initial.commands);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initial.commands[0]?.id,
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ci = commands.findIndex((c) => c.id === selectedId);
  const cmd = ci >= 0 ? commands[ci] : undefined;

  function update(patch: Partial<CustomCommand>) {
    setCommands((cs) => cs.map((c, i) => (i === ci ? { ...c, ...patch } : c)));
  }
  function addCommand() {
    const c = emptyCommand();
    setCommands((cs) => [...cs, c]);
    setSelectedId(c.id);
  }
  function removeCommand() {
    setCommands((cs) => {
      const next = cs.filter((c) => c.id !== selectedId);
      setSelectedId(next[0]?.id);
      return next;
    });
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveCustomCommandsConfig(guildId, {
        enabled,
        prefix,
        commands,
      });
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle
          label="Enable custom commands"
          checked={enabled}
          onChange={setEnabled}
        />
        <div>
          <label className="label">Command prefix</label>
          <input
            className="input max-w-24"
            maxLength={5}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            What members type before the command word. With{" "}
            <code className="rounded bg-panel px-1">{prefix || "!"}</code> the
            command below is used as{" "}
            <code className="rounded bg-panel px-1">
              {prefix || "!"}
              {cmd?.name ?? "codes"}
            </code>
            .
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || undefined)}
          >
            {commands.length === 0 && (
              <option value="">No commands yet, add one →</option>
            )}
            {commands.map((c, i) => (
              <option key={c.id} value={c.id}>
                {i + 1} | {c.enabled ? "" : "(off) "}
                {prefix}
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary whitespace-nowrap"
            onClick={addCommand}
            disabled={commands.length >= 100}
          >
            + New command
          </button>
        </div>
      </div>

      {cmd && ci >= 0 && (
        <>
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Used {cmd.uses} time(s)
              </span>
              <button
                type="button"
                className="text-sm text-red-400 hover:underline"
                onClick={removeCommand}
              >
                Delete this command
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Command name</label>
                <div className="flex items-center gap-1">
                  <span className="text-zinc-400">{prefix}</span>
                  <input
                    className="input"
                    maxLength={32}
                    value={cmd.name}
                    onChange={(e) =>
                      update({
                        name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                      })
                    }
                  />
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Lowercase letters, numbers, - and _ only.
                </p>
              </div>
              <div>
                <label className="label">Aliases (comma separated)</label>
                <input
                  className="input"
                  placeholder="code, promo"
                  value={cmd.aliases.join(", ")}
                  onChange={(e) =>
                    update({
                      aliases: e.target.value
                        .split(",")
                        .map((a) =>
                          a.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                        )
                        .filter(Boolean)
                        .slice(0, 10),
                    })
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Other words that run the same command.
                </p>
              </div>
            </div>

            <Toggle
              label="Command enabled"
              checked={cmd.enabled}
              onChange={(v) => update({ enabled: v })}
            />
          </div>

          {/* Response */}
          <div className="card space-y-4">
            <div className="font-medium text-white">Response</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className="label">Who can see the response?</label>
                  <select
                    className="input"
                    value={cmd.responseMode}
                    onChange={(e) =>
                      update({
                        responseMode: e.target.value as CustomResponseMode,
                      })
                    }
                  >
                    <option value="button">
                      Private via button (recommended)
                    </option>
                    <option value="dm">Private via DM</option>
                    <option value="autodelete">Public, then auto-delete</option>
                    <option value="public">Public</option>
                  </select>
                  <p className="mt-1 text-xs text-zinc-500">
                    {MODE_HELP[cmd.responseMode]}
                  </p>
                </div>

                {cmd.responseMode === "button" && (
                  <div>
                    <label className="label">Button label</label>
                    <input
                      className="input"
                      maxLength={80}
                      value={cmd.buttonLabel}
                      onChange={(e) => update({ buttonLabel: e.target.value })}
                    />
                  </div>
                )}
                {cmd.responseMode === "autodelete" && (
                  <div>
                    <label className="label">Delete after (seconds)</label>
                    <input
                      type="number"
                      min={3}
                      max={300}
                      className="input"
                      value={cmd.deleteAfterSec}
                      onChange={(e) =>
                        update({ deleteAfterSec: Number(e.target.value) || 30 })
                      }
                    />
                  </div>
                )}

                <Toggle
                  label="Send as an embed"
                  checked={cmd.useEmbed}
                  onChange={(v) => update({ useEmbed: v })}
                />
                {cmd.useEmbed && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Embed title</label>
                      <input
                        className="input"
                        maxLength={256}
                        placeholder="Current codes"
                        value={cmd.embedTitle}
                        onChange={(e) => update({ embedTitle: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">Embed color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          className="h-9 w-12 cursor-pointer rounded border border-edge bg-panel"
                          value={cmd.embedColor}
                          onChange={(e) => update({ embedColor: e.target.value })}
                        />
                        <span className="text-sm text-zinc-400">
                          {cmd.embedColor}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="label">Response text</label>
                  <textarea
                    className="input min-h-32"
                    maxLength={4000}
                    placeholder={"FREESPIN2024\nBUILDBIG\nHOUSE100"}
                    value={cmd.response}
                    onChange={(e) => update({ response: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    {"{user}"} mentions them, {"{server}"} is the server name,{" "}
                    {"{channel}"} links the channel. Markdown works.
                  </p>
                </div>
              </div>

              <div>
                <label className="label">Preview</label>
                {cmd.useEmbed ? (
                  <DiscordPreview
                    color={cmd.embedColor}
                    title={cmd.embedTitle || "(no title)"}
                    description={cmd.response || "(no text)"}
                    buttons={
                      cmd.responseMode === "button"
                        ? [{ label: cmd.buttonLabel || "Show me" }]
                        : undefined
                    }
                  />
                ) : (
                  <div className="rounded-lg border border-edge bg-[#313338] p-4 text-sm whitespace-pre-wrap text-zinc-200">
                    {cmd.response || "(no text)"}
                  </div>
                )}
                <p className="mt-1 text-xs text-zinc-500">
                  {cmd.responseMode === "button"
                    ? "The button is public; the response appears only to whoever clicks it."
                    : cmd.responseMode === "dm"
                      ? "This is sent as a direct message."
                      : "This is what the channel sees."}
                </p>
              </div>
            </div>
          </div>

          {/* Scoping */}
          <div className="card space-y-4">
            <div className="font-medium text-white">Where and who</div>
            <MultiSelect
              label="Only in these channels"
              hint="Leave empty to allow it anywhere."
              values={cmd.channelIds}
              onChange={(v) => update({ channelIds: v })}
              options={channels}
              prefix="#"
              emptyText="Any channel"
            />
            <MultiSelect
              label="Only these roles can use it"
              hint="Leave empty to let everyone use it."
              values={cmd.allowedRoleIds}
              onChange={(v) => update({ allowedRoleIds: v })}
              options={roles}
              prefix="@"
              emptyText="Everyone"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Cooldown per user (seconds)</label>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  className="input"
                  value={cmd.cooldownSec}
                  onChange={(e) =>
                    update({ cooldownSec: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="flex items-end">
                <Toggle
                  label="Delete their command message"
                  hint="Keeps the channel clean."
                  checked={cmd.deleteTrigger}
                  onChange={(v) => update({ deleteTrigger: v })}
                />
              </div>
            </div>
          </div>
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
