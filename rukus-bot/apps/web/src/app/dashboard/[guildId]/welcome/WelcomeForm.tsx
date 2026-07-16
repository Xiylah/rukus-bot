"use client";

import { useState, useTransition } from "react";
import type { WelcomeConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { saveWelcomeConfig } from "../actions";

/** Fill the {placeholders} with sample values so staff see a realistic message. */
function renderSample(text: string): string {
  return text
    .replace(/\{user\}/gi, "@NewMember")
    .replace(/\{username\}/gi, "NewMember")
    .replace(/\{server\}/gi, "Your Server")
    .replace(/\{memberCount\}/gi, "1234");
}

/**
 * A Discord message mockup for the welcome/leave preview.
 *
 * The bot posts these as plain message content, not an embed (see the bot's
 * guildMemberAdd), so this renders a bare message bubble rather than an embed
 * card, matching exactly what a member will see. Empty input shows a hint.
 */
function MessagePreview({ text }: { text: string }) {
  const rendered = renderSample(text);
  return (
    <div className="rounded-lg border border-edge bg-[#313338] p-4 font-sans">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blurple text-sm font-bold text-white">
          R
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white">Rukus</span>
            <span className="rounded bg-blurple px-1 py-px text-[10px] font-semibold uppercase text-white">
              App
            </span>
            <span className="text-xs text-zinc-500">Today</span>
          </div>
          <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
            {rendered || (
              <span className="text-zinc-600">Nothing to preview</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
            {"{user}"} pings them, {"{username}"} is their name, {"{server}"} is
            the server name, {"{memberCount}"} is the new member total.
          </p>
          <div className="mt-2">
            <MessagePreview text={config.message} />
          </div>
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
            <div className="mt-2">
              <MessagePreview text={config.dmMessage} />
            </div>
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
          <div className="mt-2">
            <MessagePreview text={config.leaveMessage} />
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
