"use client";

import { useState, useTransition } from "react";
import type { GiveawaysConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { MultiSelect, type Option } from "@/components/Pickers";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveGiveawaysConfig } from "../actions";

export function GiveawaysForm({
  guildId,
  initial,
  roles,
}: {
  guildId: string;
  initial: GiveawaysConfig;
  roles: Option[];
}) {
  const [config, setConfig] = useState<GiveawaysConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof GiveawaysConfig>(
    key: K,
    value: GiveawaysConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveGiveawaysConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">Giveaways</div>
        <Toggle
          label="Enable giveaways"
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Entry button emoji</label>
            <input
              className="input"
              value={config.emoji}
              onChange={(e) => set("emoji", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Embed color</label>
            <input
              className="input h-10 p-1"
              type="color"
              value={config.embedColor}
              onChange={(e) => set("embedColor", e.target.value)}
            />
          </div>
        </div>
        <Toggle
          label="DM the winners"
          hint="A win is easy to miss in a fast channel, so the bot also messages them directly."
          checked={config.dmWinners}
          onChange={(v) => set("dmWinners", v)}
        />
        <div>
          <div className="label">Giveaway embed preview</div>
          <DiscordPreview
            color={config.embedColor}
            title="🎉 Nitro (1 month)"
            description={"Press **Enter** below to join.\n\nEnds: in 2 days · Winners: 1"}
            buttons={[{ emoji: config.emoji, label: "Enter (0)" }]}
          />
        </div>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Win announcement</div>
        <p className="text-sm text-zinc-400">
          The public message posted in the channel when a giveaway ends. Use{" "}
          <code className="rounded bg-panel px-1">{"{winners}"}</code> for the
          winner mentions and{" "}
          <code className="rounded bg-panel px-1">{"{prize}"}</code> for the
          prize.
        </p>
        <div>
          <label className="label">Announcement template</label>
          <textarea
            className="input min-h-20"
            maxLength={2000}
            placeholder="🎉 Congratulations {winners}, you won {prize}!"
            value={config.announceMessage}
            onChange={(e) => set("announceMessage", e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            A link to the giveaway is always appended. Only real winners get
            pinged: an @everyone or @here in here is shown as text, never a mass
            ping.
          </p>
        </div>
        <div>
          <div className="label">Preview</div>
          <DiscordPreview
            color={config.embedColor}
            title=""
            description={
              (config.announceMessage || "🎉 Congratulations {winners}, you won {prize}!")
                .replaceAll("{winners}", "@Ada, @Rai")
                .replaceAll("{prize}", "Nitro (1 month)") +
              "\nhttps://discord.com/channels/…"
            }
          />
        </div>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Who can host</div>
        <MultiSelect
          label="Host roles"
          hint="Leave empty to require Manage Server. Set roles here to let an events team run giveaways without giving them server powers."
          values={config.hostRoleIds}
          onChange={(v) => set("hostRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="Manage Server only"
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
