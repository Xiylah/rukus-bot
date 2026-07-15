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
  const [blockedText, setBlockedText] = useState(
    initial.blockedDomains.join("\n"),
  );
  const [allowedText, setAllowedText] = useState(
    initial.allowedDomains.join("\n"),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const lines = (t: string) =>
    t
      .split("\n")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 200);

  function set<K extends keyof ModerationConfig>(
    key: K,
    value: ModerationConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveModerationConfig(guildId, {
        ...config,
        bannedWords: lines(wordsText),
        blockedDomains: lines(blockedText),
        allowedDomains: lines(allowedText),
      });
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      {/* ---------- Master switches ---------- */}
      <div className="card space-y-4">
        <Toggle
          label="Enable moderation"
          hint="Off means the bot stops moderating on its own: no filters, no anti-spam, no image-only enforcement. Your mods can still use /warn, /ban and the rest, because typing one of those is asking for it on purpose."
          checked={config.enabled}
          onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
        />
        <Toggle
          label="Record cases"
          hint="Every warn, mute, kick and ban gets a numbered case with proof and a mod-log entry. Off = the commands still work, they just leave no record."
          checked={config.casesEnabled}
          onChange={(v) => setConfig((c) => ({ ...c, casesEnabled: v }))}
        />
        <Toggle
          label="DM the member when actioned"
          hint="Send the member a DM (with the reason and case number) when they are warned, muted, timed out, kicked or banned. Off = they are not notified by the bot."
          checked={config.dmOnAction}
          onChange={(v) => setConfig((c) => ({ ...c, dmOnAction: v }))}
        />
        {!config.enabled && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Moderation is off, so nothing below is running. The manual commands
            still work.
          </p>
        )}
      </div>

      {/* ---------- Anti-spam / anti-scam ---------- */}
      <div className="card space-y-4 border-red-500/30">
        <div>
          <div className="font-medium text-white">🚨 Anti-spam and anti-scam</div>
          <p className="mt-1 text-sm text-zinc-400">
            Stops compromised accounts blasting crypto/giveaway scams across
            your channels. The giveaway is that the same message hits many
            channels within seconds, which no real member ever does.
          </p>
        </div>

        <Toggle
          label="Enable anti-spam"
          hint="Catches cross-posting and repeated messages, deletes every copy, and punishes the account."
          checked={config.antiSpamEnabled}
          onChange={(v) => set("antiSpamEnabled", v)}
        />

        {config.antiSpamEnabled && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Same message in how many channels?</label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  className="input"
                  value={config.crossPostChannels}
                  onChange={(e) =>
                    set("crossPostChannels", Number(e.target.value) || 3)
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">3 is a good default.</p>
              </div>
              <div>
                <label className="label">Within how many seconds?</label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  className="input"
                  value={config.crossPostWindowSec}
                  onChange={(e) =>
                    set("crossPostWindowSec", Number(e.target.value) || 30)
                  }
                />
              </div>
              <div>
                <label className="label">Repeats in one channel</label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  className="input"
                  value={config.duplicateLimit}
                  onChange={(e) =>
                    set("duplicateLimit", Number(e.target.value) || 4)
                  }
                />
              </div>
            </div>

            <Toggle
              label="Scam content detection"
              hint="Flags messages combining giveaway/crypto/withdrawal language with links, e.g. the fake MrBeast and casino promo scams."
              checked={config.scamHeuristics}
              onChange={(v) => set("scamHeuristics", v)}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">What to do with the spammer</label>
                <select
                  className="input"
                  value={config.spamPunishment}
                  onChange={(e) =>
                    set(
                      "spamPunishment",
                      e.target.value as ModerationConfig["spamPunishment"],
                    )
                  }
                >
                  <option value="delete">Just delete the messages</option>
                  <option value="timeout">Timeout (recommended)</option>
                  <option value="kick">Kick</option>
                  <option value="ban">Ban</option>
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  Timeout is safest: a compromised friend gets silenced, not
                  banned. Every action is recorded as a case.
                </p>
              </div>
              {config.spamPunishment === "timeout" && (
                <div>
                  <label className="label">Timeout length (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    max={40320}
                    className="input"
                    value={config.spamTimeoutMin}
                    onChange={(e) =>
                      set("spamTimeoutMin", Number(e.target.value) || 60)
                    }
                  />
                </div>
              )}
            </div>

            <Toggle
              label="Delete every copy they posted"
              hint="Not just the message that tripped the filter, but all the ones already sitting in your other channels."
              checked={config.purgeAllCopies}
              onChange={(v) => set("purgeAllCopies", v)}
            />

            <Select
              label="Spam report channel"
              hint="Where the 'Spam blocked' reports go. Leave empty to use the mod-log channel below."
              value={config.spamLogChannelId}
              onChange={(v) => set("spamLogChannelId", v)}
              options={channels}
              prefix="#"
              placeholder="Use the mod-log channel"
            />
          </>
        )}
      </div>

      {/* ---------- Links ---------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">🔗 Link controls</div>
        <div>
          <label className="label">Blocked domains (one per line)</label>
          <textarea
            className="input min-h-20 font-mono text-xs"
            placeholder={"kutwon.com\nsketchy-casino.net"}
            value={blockedText}
            onChange={(e) => setBlockedText(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Always deleted. Subdomains are covered automatically.
          </p>
        </div>
        <Toggle
          label="Block all links from members"
          hint="Nuclear option: only allowed domains below get through. Staff and exempt roles are unaffected."
          checked={config.blockLinks}
          onChange={(v) => set("blockLinks", v)}
        />
        <div>
          <label className="label">Allowed domains (one per line)</label>
          <textarea
            className="input min-h-20 font-mono text-xs"
            placeholder={"roblox.com\nyoutube.com\ntenor.com"}
            value={allowedText}
            onChange={(e) => setAllowedText(e.target.value)}
          />
        </div>
        <div>
          <label className="label">
            Block links from accounts younger than (days)
          </label>
          <input
            type="number"
            min={0}
            max={365}
            className="input"
            value={config.minAccountAgeDaysForLinks}
            onChange={(e) =>
              set("minAccountAgeDaysForLinks", Number(e.target.value) || 0)
            }
          />
          <p className="mt-1 text-xs text-zinc-500">
            0 = off. Scam blasts nearly always come from brand-new throwaway
            accounts, so even 7 days stops most of them cold.
          </p>
        </div>
      </div>

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
        <Select
          label="Muted role"
          hint="The role /mute gives. Create a role that denies Send Messages in your channels, then pick it here. Keep it BELOW the bot's role or the bot can't assign it."
          value={config.mutedRoleId}
          onChange={(v) => set("mutedRoleId", v)}
          options={roles}
          prefix="@"
          placeholder="No muted role (/mute disabled)"
        />
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
