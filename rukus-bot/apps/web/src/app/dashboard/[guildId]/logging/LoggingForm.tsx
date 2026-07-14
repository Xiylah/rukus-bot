"use client";

import { useState, useTransition } from "react";
import type { LoggingConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { saveLoggingConfig } from "./actions";

/** The boolean event fields, named so a toggle can be keyed by config field. */
type EventKey = Exclude<
  {
    [K in keyof LoggingConfig]-?: LoggingConfig[K] extends boolean ? K : never;
  }[keyof LoggingConfig],
  "enabled" | "ignoreBots"
>;

/** The five per-stream channel fields. */
type StreamKey =
  | "messageChannelId"
  | "memberChannelId"
  | "serverChannelId"
  | "voiceChannelId"
  | "joinChannelId";

/**
 * The event grid, grouped the way people think about it rather than the way the
 * config object is ordered. Each group also names the channel that carries it,
 * so it is obvious where a toggled-on event will actually land.
 */
const GROUPS: {
  title: string;
  stream: StreamKey;
  streamLabel: string;
  events: { key: EventKey; label: string }[];
}[] = [
  {
    title: "Messages",
    stream: "messageChannelId",
    streamLabel: "Message log channel",
    events: [
      { key: "messageDelete", label: "Message deleted" },
      { key: "messageEdit", label: "Message edited" },
      { key: "messageBulkDelete", label: "Bulk delete (purge)" },
    ],
  },
  {
    title: "Joins & leaves",
    stream: "joinChannelId",
    streamLabel: "Join/leave log channel",
    events: [
      { key: "memberJoin", label: "Member joined" },
      { key: "memberLeave", label: "Member left" },
    ],
  },
  {
    title: "Members",
    stream: "memberChannelId",
    streamLabel: "Member log channel",
    events: [
      { key: "memberBan", label: "Member banned" },
      { key: "memberUnban", label: "Member unbanned" },
      { key: "memberKick", label: "Member kicked" },
      { key: "memberRoleChange", label: "Roles changed" },
      { key: "memberNickChange", label: "Nickname changed" },
      { key: "memberAvatarChange", label: "Server avatar changed" },
    ],
  },
  {
    title: "Server",
    stream: "serverChannelId",
    streamLabel: "Server log channel",
    events: [
      { key: "channelCreate", label: "Channel created" },
      { key: "channelDelete", label: "Channel deleted" },
      { key: "channelUpdate", label: "Channel updated" },
      { key: "roleCreate", label: "Role created" },
      { key: "roleDelete", label: "Role deleted" },
      { key: "roleUpdate", label: "Role updated" },
      { key: "emojiUpdate", label: "Emojis changed" },
      { key: "serverUpdate", label: "Server settings changed" },
      { key: "inviteCreate", label: "Invite created" },
      { key: "inviteDelete", label: "Invite deleted" },
    ],
  },
  {
    title: "Voice",
    stream: "voiceChannelId",
    streamLabel: "Voice log channel",
    events: [
      { key: "voiceJoin", label: "Joined a voice channel" },
      { key: "voiceLeave", label: "Left a voice channel" },
      { key: "voiceMove", label: "Moved voice channel" },
    ],
  },
];

/** A compact checkbox: 24 full-width toggle rows would be an unreadable wall. */
function EventCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
        checked
          ? "border-blurple/40 bg-blurple/15 text-white"
          : "border-edge bg-card text-zinc-400 hover:text-white"
      }`}
      aria-pressed={checked}
    >
      <input type="checkbox" checked={checked} readOnly className="pointer-events-none" />
      {label}
    </button>
  );
}

export function LoggingForm({
  guildId,
  initial,
  channels,
}: {
  guildId: string;
  initial: LoggingConfig;
  channels: Option[];
}) {
  const [config, setConfig] = useState<LoggingConfig>(initial);
  // Member IDs are typed, not picked: a big server has tens of thousands of
  // members and no dropdown can usefully hold them.
  const [ignoreUsersText, setIgnoreUsersText] = useState(
    initial.ignoreUserIds.join("\n"),
  );
  const [prefixText, setPrefixText] = useState(initial.ignorePrefixes.join(" "));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof LoggingConfig>(key: K, value: LoggingConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveLoggingConfig(guildId, {
        ...config,
        ignoreUserIds: ignoreUsersText
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter((s) => /^\d{17,20}$/.test(s))
          .slice(0, 200),
        ignorePrefixes: prefixText
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20),
      });
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle
          label="Enable server logging"
          hint="Nothing is logged while this is off, whatever the toggles below say."
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <Select
          label="Default log channel"
          hint="Every stream without a channel of its own posts here. Set this and you are done."
          value={config.defaultChannelId}
          onChange={(v) => set("defaultChannelId", v)}
          options={channels}
          prefix="#"
        />
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="card space-y-4">
          <div className="font-medium text-white">{group.title}</div>

          <Select
            label={group.streamLabel}
            hint="Leave empty to use the default log channel."
            value={config[group.stream]}
            onChange={(v) => set(group.stream, v)}
            options={channels}
            prefix="#"
            placeholder="Same as default"
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.events.map((e) => (
              <EventCheck
                key={e.key}
                label={e.label}
                checked={config[e.key]}
                onChange={(v) => set(e.key, v)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="card space-y-4">
        <div className="font-medium text-white">What to ignore</div>

        <MultiSelect
          label="Ignored channels"
          hint="Nothing that happens in these channels is ever logged."
          values={config.ignoreChannelIds}
          onChange={(v) => set("ignoreChannelIds", v)}
          options={channels}
          prefix="#"
          emptyText="No ignored channels"
        />

        <Toggle
          label="Ignore bots"
          hint="Skip messages and edits from other bots. Bans and kicks of a bot are still logged."
          checked={config.ignoreBots}
          onChange={(v) => set("ignoreBots", v)}
        />

        <div>
          <label className="label">Ignored user IDs</label>
          <textarea
            className="input min-h-20"
            value={ignoreUsersText}
            onChange={(e) => setIgnoreUsersText(e.target.value)}
            placeholder="One ID per line"
          />
          <p className="mt-1 text-xs text-zinc-500">
            One Discord user ID per line. Anything that is not a valid ID is
            dropped when you save.
          </p>
        </div>

        <div>
          <label className="label">Ignored message prefixes</label>
          <input
            className="input"
            value={prefixText}
            onChange={(e) => setPrefixText(e.target.value)}
            placeholder="! ? ."
          />
          <p className="mt-1 text-xs text-zinc-500">
            Space-separated. Messages starting with one of these are never logged.
            Other bots&apos; commands are the biggest source of log noise.
          </p>
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
