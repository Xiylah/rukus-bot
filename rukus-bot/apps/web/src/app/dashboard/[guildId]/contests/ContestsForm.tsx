"use client";

import { useState, useTransition } from "react";
import type { ContestsConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveContestsConfig } from "./actions";

/** Indexed 0 = Sunday, matching recurringDayOfWeek and JS getDay(). */
const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

/**
 * One item per line, parsed on BLUR not on every keystroke. Binding to
 * `list.join("\n")` and parsing per-keystroke eats the newline the instant you
 * press Enter, so the raw text is the state while typing and only becomes a list
 * when you leave the field.
 */
function LineList({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [text, setText] = useState(value.join("\n"));
  const [lastSeen, setLastSeen] = useState(value);
  if (value !== lastSeen) {
    setLastSeen(value);
    setText(value.join("\n"));
  }
  return (
    <textarea
      className="input min-h-20 font-mono text-sm"
      rows={rows}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = [
          ...new Set(
            text
              .split("\n")
              .map((s) =>
                s
                  .trim()
                  .toLowerCase()
                  // Paste-proofing: accept a full URL and keep just the host.
                  .replace(/^https?:\/\//, "")
                  .replace(/^www\./, "")
                  .split("/")[0]!,
              )
              .filter(Boolean),
          ),
        ];
        onChange(parsed);
        setText(parsed.join("\n"));
        setLastSeen(parsed);
      }}
    />
  );
}

export function ContestsForm({
  guildId,
  initial,
  channels,
  roles,
}: {
  guildId: string;
  initial: ContestsConfig;
  channels: Option[];
  roles: Option[];
}) {
  const [config, setConfig] = useState<ContestsConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof ContestsConfig>(key: K, value: ContestsConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveContestsConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  const sampleWinners =
    `🥇 @TopPoster with **12** votes ([entry](#))\n` +
    `🥈 @Runner-up with **9** votes ([entry](#))\n` +
    `🥉 @ThirdPlace with **5** votes ([entry](#))`;

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle
          label="Enable contests"
          hint="When a contest is running, image and video posts in its channel are entered automatically."
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        {!config.enabled && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Contests are off, so /contest start will refuse and nothing below is
            running.
          </p>
        )}
      </div>

      {/* ---------- Defaults ---------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Defaults for a new contest</div>
        <p className="text-sm text-zinc-400">
          What <code className="rounded bg-panel px-1">/contest start</code> uses
          when the host does not say otherwise. They can always override both on
          the command.
        </p>

        <MultiSelect
          label="Contest channels"
          hint="A contest runs in every channel picked here, so you can accept photos in one and clips in another. Leave empty to use whichever channel the command is run in."
          values={config.defaultChannelIds}
          onChange={(v) => set("defaultChannelIds", v)}
          options={channels}
          prefix="#"
          emptyText="The channel /contest start is run in"
        />

        <div>
          <label className="label">How many places are awarded</label>
          <input
            type="number"
            min={1}
            max={50}
            className="input max-w-32"
            value={config.defaultWinnerCount}
            onChange={(e) =>
              set("defaultWinnerCount", Number(e.target.value) || 1)
            }
          />
          <p className="mt-1 text-xs text-zinc-500">
            1 awards a single winner, 3 gives 🥇🥈🥉. Up to 50. Entries with no
            votes never place, so a quiet contest awards fewer than this.
          </p>
        </div>
      </div>

      {/* ---------- Voting ---------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Voting</div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Vote emoji</label>
            <input
              className="input max-w-32 text-lg"
              maxLength={64}
              value={config.voteEmoji}
              onChange={(e) => set("voteEmoji", e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Only this emoji counts as a vote, so joke reactions do not skew the
              result. The bot adds it to each entry, making voting one click.
            </p>
          </div>
          <div>
            <label className="label">Entries per member</label>
            <input
              type="number"
              min={0}
              max={50}
              className="input max-w-32"
              value={config.maxEntriesPerUser}
              onChange={(e) =>
                set("maxEntriesPerUser", Number(e.target.value) || 0)
              }
            />
            <p className="mt-1 text-xs text-zinc-500">
              0 means unlimited. Extra posts past the limit are not entered.
            </p>
          </div>
        </div>

        <Toggle
          label="Ignore self-votes"
          hint="A member reacting to their own entry does not count. Self-votes add the same point to everyone, so they carry no signal."
          checked={config.ignoreSelfVotes}
          onChange={(v) => set("ignoreSelfVotes", v)}
        />
        <Toggle
          label="Only allow images and videos in the contest channel"
          hint="While a contest runs, delete text-only chatter posted in its channel. Off = conversation is left alone and simply not entered."
          checked={config.enforceMediaOnly}
          onChange={(v) => set("enforceMediaOnly", v)}
        />

        <Toggle
          label="Accept links as entries"
          hint="Uploading a real video needs Nitro, so for most members a YouTube, Streamable or Imgur link is the only way to enter a video contest. YouTube, Imgur, Streamable, Medal, Twitch clips, Tenor, Google Drive and direct image/video URLs are recognised out of the box."
          checked={config.allowLinks}
          onChange={(v) => set("allowLinks", v)}
        />

        {config.allowLinks && (
          <div>
            <label className="label">
              Extra link hosts ({config.extraMediaHosts.length}) - one per line
            </label>
            <LineList
              value={config.extraMediaHosts}
              onChange={(v) => set("extraMediaHosts", v)}
              placeholder={"mysite.com\nclips.example.org"}
              rows={4}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Only needed for a host that is not already recognised. Just the
              domain, no https. Any link ending in .png, .mp4 and so on is always
              accepted whatever the host.
            </p>
          </div>
        )}
      </div>

      {/* ---------- Judging ---------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Judging</div>
        <Toggle
          label="Let judges score entries"
          hint="Judges run /contest judge to score an entry 1-10. Pure reaction voting rewards whoever has the most friends online; a judged score is the counterweight."
          checked={config.judgingEnabled}
          onChange={(v) => set("judgingEnabled", v)}
        />

        {config.judgingEnabled && (
          <>
            <MultiSelect
              label="Judge roles"
              hint="These roles can run /contest judge and /contest entries. Members with Manage Server can always judge."
              values={config.judgeRoleIds}
              onChange={(v) => set("judgeRoleIds", v)}
              options={roles}
              prefix="@"
              emptyText="Manage Server only"
            />

            <div>
              <label className="label">
                Judges decide {config.judgeWeightPercent}% of the result
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                className="w-full"
                value={config.judgeWeightPercent}
                onChange={(e) =>
                  set("judgeWeightPercent", Number(e.target.value))
                }
              />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>0% - public votes only</span>
                <span>100% - judges only</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Votes and judge scores are each scaled against the best entry in
                the contest before blending, so a contest with 3 votes and one
                with 300 both behave sensibly. Judges cannot score their own
                entry.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ---------- Recurring ---------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Recurring contest</div>
        <Toggle
          label="Start a contest automatically"
          hint="The bot opens a new contest on the day and hour you pick, so nobody has to remember to."
          checked={config.recurringEnabled}
          onChange={(v) => set("recurringEnabled", v)}
        />

        {config.recurringEnabled && (
          <>
            {config.defaultChannelIds.length === 0 && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Pick at least one contest channel above. A scheduled contest has
                no channel to fall back on, so it will be skipped.
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Day</label>
                <select
                  className="input"
                  value={config.recurringDayOfWeek}
                  onChange={(e) =>
                    set("recurringDayOfWeek", Number(e.target.value))
                  }
                >
                  {DAY_NAMES.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Hour (0-23)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  className="input max-w-32"
                  value={config.recurringHour}
                  onChange={(e) =>
                    set("recurringHour", Number(e.target.value) || 0)
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Runs for (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  className="input max-w-32"
                  value={config.recurringDurationHours}
                  onChange={(e) =>
                    set("recurringDurationHours", Number(e.target.value) || 1)
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">
                  168 is one week. Up to 720 (30 days).
                </p>
              </div>
              <div>
                <label className="label">Timezone</label>
                <input
                  className="input"
                  maxLength={64}
                  placeholder="Europe/London"
                  value={config.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  An IANA name like Europe/London or America/New_York. Unknown
                  zones fall back to UTC.
                </p>
              </div>
            </div>

            <div>
              <label className="label">Contest title</label>
              <input
                className="input"
                maxLength={200}
                value={config.recurringTitle}
                onChange={(e) => set("recurringTitle", e.target.value)}
              />
            </div>

            <p className="text-xs text-zinc-500">
              If a contest is already running in those channels when the
              schedule comes round, that occurrence is skipped rather than
              stacking a second one.
            </p>
          </>
        )}
      </div>

      {/* ---------- Who can host ---------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Who can run a contest</div>
        <MultiSelect
          label="Host roles"
          hint="These roles can use /contest even without Manage Server. Members with Manage Server can always host."
          values={config.hostRoleIds}
          onChange={(v) => set("hostRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="Manage Server only"
        />
      </div>

      {/* ---------- Results ---------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Results</div>

        <Select
          label="Announce results in"
          hint="Leave empty to announce in the contest's own channel."
          value={config.resultsChannelId}
          onChange={(v) => set("resultsChannelId", v)}
          options={channels}
          prefix="#"
          placeholder="The contest channel"
        />

        <div>
          <label className="label">Embed color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-9 w-12 cursor-pointer rounded border border-edge bg-panel"
              value={config.embedColor}
              onChange={(e) => set("embedColor", e.target.value)}
            />
            <span className="text-sm text-zinc-400">{config.embedColor}</span>
          </div>
        </div>

        <div>
          <label className="label">Winner announcement</label>
          <textarea
            className="input min-h-20"
            maxLength={2000}
            value={config.announceMessage}
            onChange={(e) => set("announceMessage", e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            {"{winners}"} is the placed list, {"{title}"} the contest name,{" "}
            {"{count}"} how many placed. Mentions are limited to users, so an
            @everyone in here can never mass-ping.
          </p>
        </div>

        <Toggle
          label="DM the winners"
          hint="Also send each placed member a direct message."
          checked={config.dmWinners}
          onChange={(v) => set("dmWinners", v)}
        />

        <div>
          <label className="label">Preview</label>
          <DiscordPreview
            color={config.embedColor}
            title="🏆 Best Build of the Month"
            description={config.announceMessage
              .replace(/\{winners\}/gi, sampleWinners)
              .replace(/\{title\}/gi, "Best Build of the Month")
              .replace(/\{count\}/gi, "3")}
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
    </div>
  );
}
