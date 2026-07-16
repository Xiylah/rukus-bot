"use client";

import { useState, useTransition } from "react";
import type { UtilityConfig, AfkConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveUtilityConfig, saveAfkConfig } from "../utility-actions";

export function UtilityForm({
  guildId,
  initial,
  afk: afkInitial,
}: {
  guildId: string;
  initial: UtilityConfig;
  afk: AfkConfig;
}) {
  const [config, setConfig] = useState<UtilityConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // AFK rides along on this page but is its own config row, so it gets its own
  // state and save so the two never clobber each other.
  const [afk, setAfk] = useState<AfkConfig>(afkInitial);
  const [afkPending, startAfkTransition] = useTransition();
  const [afkMsg, setAfkMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function setAfkField<K extends keyof AfkConfig>(key: K, value: AfkConfig[K]) {
    setAfk((c) => ({ ...c, [key]: value }));
  }

  function onSaveAfk() {
    setAfkMsg(null);
    startAfkTransition(async () => {
      const res = await saveAfkConfig(guildId, afk);
      setAfkMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  // Draft state for the embed preview. It is deliberately NOT saved: /embed
  // posts one message, it has no persistent config, and pretending otherwise
  // would imply the dashboard could edit an embed after it was sent.
  const [title, setTitle] = useState("Server rules");
  const [description, setDescription] = useState(
    "Be kind.\nNo spam.\nStaff have the final say.",
  );
  const [color, setColor] = useState("#5865f2");

  function set<K extends keyof UtilityConfig>(key: K, value: UtilityConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveUtilityConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle
          label="Enable utility commands"
          hint="The master switch for everything on this page."
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <Toggle
          label="/poll"
          hint="A reaction poll with up to 10 lettered options, or a yes/no if you give none."
          checked={config.polls}
          onChange={(v) => set("polls", v)}
        />
        <Toggle
          label="/embed"
          hint="Post a formatted embed: title, description, color, image, thumbnail, footer."
          checked={config.embedBuilder}
          onChange={(v) => set("embedBuilder", v)}
        />
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Embed builder</div>
        <p className="text-sm text-zinc-400">
          Draft it here, then copy the values into /embed in Discord. Nothing on
          this card is saved: /embed posts a one-off message.
        </p>

        <div>
          <label className="label">Title</label>
          <input
            className="input"
            value={title}
            maxLength={256}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-24"
            value={description}
            maxLength={4000}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Discord&apos;s slash-command box can&apos;t hold a real line break,
            so type <code>\n</code> where you want one and /embed will turn it
            into one.
          </p>
        </div>

        <div>
          <label className="label">Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              className="h-10 w-14 rounded border border-edge bg-card"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <input
              className="input max-w-32 font-mono"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Pass this to /embed as <code>color:{color}</code>, or use a name:
            primary, success, danger, warning.
          </p>
        </div>

        <div>
          <div className="label">Preview</div>
          <DiscordPreview
            color={color}
            title={title}
            description={description.replace(/\\n/g, "\n")}
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

      <div className="card space-y-4">
        <div className="font-medium text-white">AFK</div>
        <p className="text-sm text-zinc-400">
          Members can mark themselves away with /afk; anyone who pings them sees
          the reason instead of waiting for a reply.
        </p>
        <Toggle
          label="Rename to [AFK]"
          hint="Prefix an away member's nickname with [AFK] and restore it when they return. Off leaves nicknames untouched."
          checked={afk.renameNickname}
          onChange={(v) => setAfkField("renameNickname", v)}
        />
        <Toggle
          label="Welcome-back message"
          hint="Post a short 'welcome back, you were away for…' note in the channel when someone returns."
          checked={afk.welcomeBackEnabled}
          onChange={(v) => setAfkField("welcomeBackEnabled", v)}
        />

        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={onSaveAfk} disabled={afkPending}>
            {afkPending ? "Saving…" : "Save changes"}
          </button>
          {afkMsg && (
            <span className={afkMsg.ok ? "text-green-400" : "text-red-400"}>
              {afkMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
