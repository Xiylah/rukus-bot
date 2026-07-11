"use client";

import { useState, useTransition } from "react";
import type { ModerationConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { saveModerationConfig } from "../actions";

export function ModerationForm({
  guildId,
  initial,
  channels,
  roles,
}: {
  guildId: string;
  initial: ModerationConfig;
  channels: Option[];
  roles: Option[];
}) {
  const [config, setConfig] = useState<ModerationConfig>(initial);
  const [wordsText, setWordsText] = useState(initial.bannedWords.join("\n"));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof ModerationConfig>(
    key: K,
    value: ModerationConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    const bannedWords = wordsText
      .split("\n")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 200);
    startTransition(async () => {
      const res = await saveModerationConfig(guildId, { ...config, bannedWords });
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">Message filters</div>
        <Toggle
          label="Drug/substance filter"
          hint="Delete messages mentioning drug terms and post a family-friendly reminder."
          checked={config.drugFilter}
          onChange={(v) => set("drugFilter", v)}
        />
        <Toggle
          label="Banned words"
          hint="Delete messages containing your custom banned words or phrases."
          checked={config.bannedWordsEnabled}
          onChange={(v) => set("bannedWordsEnabled", v)}
        />
        <div>
          <label className="label">Banned words list (one per line)</label>
          <textarea
            className="input min-h-28"
            placeholder={"badword\nanother phrase to block"}
            value={wordsText}
            onChange={(e) => setWordsText(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Single words match whole words only; phrases match anywhere. Case
            doesn't matter. Up to 200 entries.
          </p>
        </div>
        <Toggle
          label="Block Discord invite links"
          hint="Delete discord.gg invites posted by members (staff are exempt)."
          checked={config.blockInvites}
          onChange={(v) => set("blockInvites", v)}
        />
        <div>
          <label className="label">Max mentions per message (0 = off)</label>
          <input
            type="number"
            min={0}
            max={50}
            className="input"
            value={config.maxMentions}
            onChange={(e) => set("maxMentions", Number(e.target.value) || 0)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Deletes mass-ping spam, e.g. messages mentioning more than 5 people.
          </p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Staff settings</div>
        <MultiSelect
          label="Exempt roles"
          hint="These roles bypass every filter above. Anyone with Manage Messages is always exempt."
          values={config.exemptRoleIds}
          onChange={(v) => set("exemptRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="No extra exemptions"
        />
        <Select
          label="Mod-log channel"
          hint="Every removed message gets logged here with its author and content, so staff can review what the filters are doing."
          value={config.logChannelId}
          onChange={(v) => set("logChannelId", v)}
          options={channels}
          prefix="#"
          placeholder="Don't log removals"
        />
        <Select
          label="Image-only channel"
          hint="Text-only messages posted here get deleted (e.g. a showcase channel)."
          value={config.imageOnlyChannelId}
          onChange={(v) => set("imageOnlyChannelId", v)}
          options={channels}
          prefix="#"
          placeholder="Disabled"
        />
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
