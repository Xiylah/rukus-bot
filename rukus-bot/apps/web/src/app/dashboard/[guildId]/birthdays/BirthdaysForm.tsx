"use client";

import { useState, useTransition } from "react";
import type { BirthdaysConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, type Option } from "@/components/Pickers";
import { saveBirthdaysConfig } from "./actions";

export interface BirthdayRow {
  userId: string;
  day: number;
  month: number;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * A short list of common zones for the dropdown. Anything IANA is accepted by
 * the server action, but a free-text box alone would be a typo trap for the
 * majority who just want their own country.
 */
const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Warsaw",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function formatDayMonth(day: number, month: number): string {
  return `${day} ${MONTHS[month - 1] ?? ""}`;
}

export function BirthdaysForm({
  guildId,
  initial,
  channels,
  roles,
  birthdays,
}: {
  guildId: string;
  initial: BirthdaysConfig;
  channels: Option[];
  roles: Option[];
  birthdays: BirthdayRow[];
}) {
  const [config, setConfig] = useState<BirthdaysConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof BirthdaysConfig>(
    key: K,
    value: BirthdaysConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveBirthdaysConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  const preview = config.message
    .replace(/\{user\}/gi, "@Ada")
    .replace(/\{username\}/gi, "Ada")
    .replace(/\{server\}/gi, "your server");

  const timezoneOptions: Option[] = TIMEZONES.map((tz) => ({ id: tz, name: tz }));
  // Keep a zone that was set elsewhere (or typed by hand) visible in the list.
  if (config.timezone && !TIMEZONES.includes(config.timezone)) {
    timezoneOptions.unshift({ id: config.timezone, name: config.timezone });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">The announcement</div>
        <Toggle
          label="Enable birthdays"
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <Select
          label="Announcement channel"
          hint="Where the birthday message is posted."
          value={config.channelId}
          onChange={(v) => set("channelId", v)}
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
            {"{user}"} pings them, {"{username}"} is their name without a ping,{" "}
            {"{server}"} is the server name. If several people share a birthday
            they are all named in one message.
          </p>
          <div className="mt-2 rounded-md border border-edge bg-black/20 p-3 text-sm text-zinc-300">
            {preview || <span className="text-zinc-600">Nothing to preview</span>}
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">When it fires</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Hour of the day</label>
            <select
              className="input"
              value={config.announceHour}
              onChange={(e) => set("announceHour", Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
          <Select
            label="Timezone"
            hint="The bot uses this to decide whose birthday it is right now."
            value={config.timezone}
            onChange={(v) => set("timezone", v ?? "UTC")}
            options={timezoneOptions}
            placeholder="UTC"
          />
        </div>
        <p className="text-xs text-zinc-500">
          The bot checks every few minutes, so the message lands shortly after
          the hour rather than exactly on it.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">The birthday role</div>
        <Select
          label="Role for the day"
          hint="Given on the morning of their birthday and taken back the next day. Leave empty for no role."
          value={config.birthdayRoleId}
          onChange={(v) => set("birthdayRoleId", v)}
          options={roles}
          prefix="@"
        />
        <p className="text-xs text-zinc-500">
          Only roles below the bot&apos;s own role can be given out. If the role
          you want is missing, drag the bot&apos;s role above it in Server
          Settings.
        </p>
      </div>

      <div className="card space-y-3">
        <div className="font-medium text-white">
          Saved birthdays ({birthdays.length})
        </div>
        <p className="text-xs text-zinc-500">
          Members add themselves with /birthday set, and can delete themselves
          with /birthday remove. Birth years are never shown, here or in Discord.
        </p>
        {birthdays.length === 0 ? (
          <p className="text-sm text-zinc-500">Nobody has set one yet.</p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {birthdays.map((b) => (
              <div
                key={b.userId}
                className="flex items-center justify-between rounded border border-edge px-3 py-1.5 text-sm"
              >
                <span className="text-zinc-300">
                  {formatDayMonth(b.day, b.month)}
                </span>
                <span className="text-zinc-500">{b.userId}</span>
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
