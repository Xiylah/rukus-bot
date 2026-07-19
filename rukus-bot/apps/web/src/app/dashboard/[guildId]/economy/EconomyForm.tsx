"use client";

import { useState, useTransition } from "react";
import type { CurrencyMultiplierRole, EconomyConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { MultiSelect, Select, type Option } from "@/components/Pickers";
import { saveEconomyConfig } from "./actions";

export function EconomyForm({
  guildId,
  initial,
  channels,
  voiceChannels,
  roles,
}: {
  guildId: string;
  initial: EconomyConfig;
  channels: Option[];
  voiceChannels: Option[];
  roles: Option[];
}) {
  const [config, setConfig] = useState<EconomyConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof EconomyConfig>(key: K, value: EconomyConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveEconomyConfig(guildId, config);
      setMsg(
        res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error },
      );
    });
  }

  // ---- Multiplier roles ----
  function setMultiplier(i: number, patch: Partial<CurrencyMultiplierRole>) {
    set(
      "multiplierRoles",
      config.multiplierRoles.map((m, mi) =>
        mi === i ? { ...m, ...patch } : m,
      ),
    );
  }
  function addMultiplier() {
    set("multiplierRoles", [
      ...config.multiplierRoles,
      { roleId: "", multiplier: 2 },
    ]);
  }
  function removeMultiplier(i: number) {
    set(
      "multiplierRoles",
      config.multiplierRoles.filter((_, mi) => mi !== i),
    );
  }

  // Empty roleIds are placeholders from "Add"; the schema would reject them, so
  // they must not reach the save.
  const incomplete = config.multiplierRoles.some((m) => !m.roleId);
  const rangeBad = config.perMessageMin > config.perMessageMax;

  const avg = (config.perMessageMin + config.perMessageMax) / 2;
  const perMinute = config.messageCooldownSec > 0 ? 60 / config.messageCooldownSec : 0;
  const maxStreakPayout =
    config.dailyAmount +
    config.dailyStreakBonus * Math.max(0, config.dailyStreakCap - 1);

  const sym = config.currencySymbol;

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">Currency</div>
        <Toggle
          label="Enable the economy"
          hint="Members earn currency for talking and sitting in voice, claim a daily, and can pay each other."
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Currency name</label>
            <input
              className="input"
              maxLength={40}
              value={config.currencyName}
              onChange={(e) => set("currencyName", e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Plural, as it reads in a sentence: &ldquo;you have 50 coins&rdquo;.
            </p>
          </div>
          <div>
            <label className="label">Symbol</label>
            <input
              className="input"
              maxLength={16}
              value={config.currencySymbol}
              onChange={(e) => set("currencySymbol", e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Shown before every amount: {sym} 1,250
            </p>
          </div>
        </div>

        <div>
          <label className="label">Starting balance</label>
          <input
            type="number"
            className="input max-w-40"
            min={0}
            max={1_000_000}
            value={config.startingBalance}
            onChange={(e) =>
              set("startingBalance", Number(e.target.value) || 0)
            }
          />
          <p className="mt-1 text-xs text-zinc-500">
            Granted once, the first time a member&rsquo;s balance is created.
            Leave at 0 to have everyone start from nothing.
          </p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Earning from messages</div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Minimum per message</label>
            <input
              type="number"
              className="input"
              min={0}
              max={10_000}
              value={config.perMessageMin}
              onChange={(e) => set("perMessageMin", Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="label">Maximum per message</label>
            <input
              type="number"
              className="input"
              min={0}
              max={10_000}
              value={config.perMessageMax}
              onChange={(e) => set("perMessageMax", Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="label">Cooldown (seconds)</label>
            <input
              type="number"
              className="input"
              min={0}
              max={3600}
              value={config.messageCooldownSec}
              onChange={(e) =>
                set("messageCooldownSec", Number(e.target.value) || 0)
              }
            />
          </div>
        </div>

        {rangeBad && (
          <p className="text-xs text-amber-400">
            Minimum is above maximum. Swap them before saving.
          </p>
        )}

        <p className="text-xs text-zinc-500">
          A member is paid at most once every {config.messageCooldownSec}s, so
          the fastest anyone can earn is about{" "}
          <span className="text-zinc-300">
            {Math.round(avg * perMinute).toLocaleString()} {config.currencyName}{" "}
            per minute
          </span>{" "}
          of constant chatting.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Earning from voice</div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Per minute in a call</label>
            <input
              type="number"
              className="input"
              min={0}
              max={1000}
              value={config.perVoiceMinute}
              onChange={(e) =>
                set("perVoiceMinute", Number(e.target.value) || 0)
              }
            />
            <p className="mt-1 text-xs text-zinc-500">
              Set to 0 to switch voice earning off entirely.
            </p>
          </div>
          <div>
            <label className="label">Minimum people in the call</label>
            <input
              type="number"
              className="input"
              min={1}
              max={50}
              value={config.voiceMinMembers}
              onChange={(e) =>
                set("voiceMinMembers", Number(e.target.value) || 1)
              }
            />
            <p className="mt-1 text-xs text-zinc-500">
              Below this, nobody in the channel earns anything. Keep it at 2 or
              more, or someone can idle alone overnight and top the list.
            </p>
          </div>
        </div>

        <p className="text-xs text-zinc-500">
          An hour in a busy call is{" "}
          <span className="text-zinc-300">
            {(config.perVoiceMinute * 60).toLocaleString()}{" "}
            {config.currencyName}
          </span>{" "}
          before any multiplier.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Daily reward</div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Base amount</label>
            <input
              type="number"
              className="input"
              min={0}
              max={100_000}
              value={config.dailyAmount}
              onChange={(e) => set("dailyAmount", Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="label">Bonus per streak day</label>
            <input
              type="number"
              className="input"
              min={0}
              max={10_000}
              value={config.dailyStreakBonus}
              onChange={(e) =>
                set("dailyStreakBonus", Number(e.target.value) || 0)
              }
            />
          </div>
          <div>
            <label className="label">Streak cap (days)</label>
            <input
              type="number"
              className="input"
              min={1}
              max={365}
              value={config.dailyStreakCap}
              onChange={(e) =>
                set("dailyStreakCap", Number(e.target.value) || 1)
              }
            />
          </div>
        </div>

        <p className="text-xs text-zinc-500">
          Day one pays {sym} {config.dailyAmount.toLocaleString()}, and the bonus
          grows until day {config.dailyStreakCap}, where it holds at{" "}
          <span className="text-zinc-300">
            {sym} {maxStreakPayout.toLocaleString()}
          </span>{" "}
          a day. /daily is once every 24 hours, and missing a day puts the streak
          back to day one.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Transfers</div>
        <Toggle
          label="Let members pay each other"
          hint="Turns /pay on. Off, currency can only come from earning and from staff."
          checked={config.payEnabled}
          onChange={(v) => set("payEnabled", v)}
        />
        <div>
          <label className="label">Transfer tax (%)</label>
          <input
            type="number"
            className="input max-w-40"
            min={0}
            max={50}
            value={config.payTaxPercent}
            onChange={(e) => set("payTaxPercent", Number(e.target.value) || 0)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Skimmed off every /pay and destroyed, which is the main brake on
            inflation once people have been earning for months. At{" "}
            {config.payTaxPercent}%, sending {sym} 1,000 delivers{" "}
            <span className="text-zinc-300">
              {sym}{" "}
              {Math.floor(
                1000 - (1000 * config.payTaxPercent) / 100,
              ).toLocaleString()}
            </span>
            .
          </p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Multiplier roles</div>
        <p className="text-sm text-zinc-400">
          Let boosters or patrons earn faster without moving the base rate.
          These do not stack: a member with several gets the highest one, not the
          product. Shop boosts multiply on top of this.
        </p>

        {config.multiplierRoles.map((mult, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="flex-1">
              <Select
                label="Role"
                value={mult.roleId || undefined}
                onChange={(v) => setMultiplier(i, { roleId: v ?? "" })}
                options={roles}
                prefix="@"
                placeholder="Pick a role"
              />
            </div>
            <div className="w-32 flex-none">
              <label className="label">Multiplier</label>
              <input
                type="number"
                className="input"
                min={0}
                max={10}
                step={0.5}
                value={mult.multiplier}
                onChange={(e) =>
                  setMultiplier(i, { multiplier: Number(e.target.value) || 0 })
                }
              />
            </div>
            <button
              type="button"
              className="btn mb-0.5 bg-red-600/80 text-white hover:bg-red-500"
              onClick={() => removeMultiplier(i)}
            >
              Remove
            </button>
          </div>
        ))}

        <button type="button" className="btn" onClick={addMultiplier}>
          + Add multiplier
        </button>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Ignore lists</div>
        <MultiSelect
          label="Channels that earn nothing"
          hint="Spam, bot-commands, counting: anywhere activity is not really conversation. Applies to voice channels too."
          values={config.ignoreChannelIds}
          onChange={(v) => set("ignoreChannelIds", v)}
          options={[...channels, ...voiceChannels]}
          prefix="#"
          emptyText="No ignored channels"
        />
        <MultiSelect
          label="Roles that earn nothing"
          values={config.ignoreRoleIds}
          onChange={(v) => set("ignoreRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="No ignored roles"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          className="btn-primary"
          onClick={onSave}
          disabled={pending || incomplete || rangeBad}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {incomplete && (
          <span className="text-sm text-amber-400">
            Pick a role for every multiplier first.
          </span>
        )}
        {msg && (
          <span className={msg.ok ? "text-green-400" : "text-red-400"}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
