"use client";

import { useState, useTransition } from "react";
import type { InviteTrackerConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, type Option } from "@/components/Pickers";
import { saveInviteTrackerConfig } from "./actions";

export interface InviterRow {
  inviterId: string;
  count: number;
}

export function InvitesForm({
  guildId,
  initial,
  channels,
  leaderboard,
  totalTracked,
}: {
  guildId: string;
  initial: InviteTrackerConfig;
  channels: Option[];
  leaderboard: InviterRow[];
  totalTracked: number;
}) {
  const [config, setConfig] = useState<InviteTrackerConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof InviteTrackerConfig>(
    key: K,
    value: InviteTrackerConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveInviteTrackerConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  const preview = config.message
    .replace(/\{user\}/gi, "@Ada")
    .replace(/\{username\}/gi, "Ada")
    .replace(/\{inviter\}/gi, "@Grace")
    .replace(/\{invites\}/gi, "7")
    .replace(/\{code\}/gi, "aB3xY9z")
    .replace(/\{server\}/gi, "your server");

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">Tracking</div>
        <Toggle
          label="Enable invite tracking"
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <Select
          label="Log channel"
          hint="Where each join and its inviter is posted."
          value={config.logChannelId}
          onChange={(v) => set("logChannelId", v)}
          options={channels}
          prefix="#"
        />
        <div>
          <label className="label">Message</label>
          <textarea
            className="input min-h-20"
            value={config.message}
            onChange={(e) => set("message", e.target.value)}
            maxLength={2000}
          />
          <p className="mt-1 text-xs text-zinc-500">
            {"{user}"} the new member, {"{username}"} their name, {"{inviter}"}{" "}
            who invited them, {"{invites}"} that inviter&apos;s running total,{" "}
            {"{code}"} the invite code, {"{server}"} the server name. Nobody is
            pinged: this is a log line.
          </p>
          <div className="mt-2 rounded-md border border-edge bg-black/20 p-3 text-sm text-zinc-300">
            {preview || <span className="text-zinc-600">Nothing to preview</span>}
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="font-medium text-white">What this can and cannot see</div>
        <p className="text-sm text-zinc-400">
          Discord never says which invite a member used. The bot keeps a count of
          every invite&apos;s uses and, the moment somebody joins, checks which
          count went up. That works well, and it has honest limits:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
          <li>
            The bot needs the <strong>Manage Server</strong> permission to read
            the invite list at all. Without it, nothing can be attributed.
          </li>
          <li>
            Joins through the server&apos;s <strong>vanity URL</strong> have no
            inviter to credit, and the bot will say so.
          </li>
          <li>
            If two people join in the same instant the bot cannot tell which
            invite belongs to which of them, so it says it could not tell rather
            than crediting the wrong person.
          </li>
        </ul>
        <p className="text-sm text-zinc-400">
          When it cannot work out the inviter it says so plainly in the log, in
          place of {"{inviter}"}. It never guesses.
        </p>
      </div>

      <div className="card space-y-3">
        <div className="font-medium text-white">
          Top inviters ({totalTracked} tracked join
          {totalTracked === 1 ? "" : "s"})
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing tracked yet. Counting starts once this is switched on.
          </p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {leaderboard.map((row, i) => (
              <div
                key={row.inviterId}
                className="flex items-center justify-between rounded border border-edge px-3 py-1.5 text-sm"
              >
                <span className="text-zinc-300">
                  <span className="text-zinc-500">#{i + 1}</span> {row.inviterId}
                </span>
                <span className="text-zinc-400">
                  {row.count} invite{row.count === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        )}
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
