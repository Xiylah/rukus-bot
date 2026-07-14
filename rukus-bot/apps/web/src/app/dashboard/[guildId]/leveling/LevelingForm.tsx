"use client";

import { useState, useTransition } from "react";
import {
  xpForLevel,
  renderLevelUp,
  type ChannelMultiplier,
  type LevelingConfig,
  type RoleReward,
  type XpMultiplierRole,
} from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { saveLevelingConfig } from "./actions";

export function LevelingForm({
  guildId,
  initial,
  channels,
  voiceChannels,
  roles,
  grantableRoles,
}: {
  guildId: string;
  initial: LevelingConfig;
  channels: Option[];
  voiceChannels: Option[];
  roles: Option[];
  grantableRoles: Option[];
}) {
  const [config, setConfig] = useState<LevelingConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof LevelingConfig>(
    key: K,
    value: LevelingConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveLevelingConfig(guildId, config);
      setMsg(
        res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error },
      );
    });
  }

  // ---- Role rewards ----
  function setReward(i: number, patch: Partial<RoleReward>) {
    set(
      "roleRewards",
      config.roleRewards.map((r, ri) => (ri === i ? { ...r, ...patch } : r)),
    );
  }
  function addReward() {
    const next = Math.max(0, ...config.roleRewards.map((r) => r.level)) + 5;
    set("roleRewards", [
      ...config.roleRewards,
      { level: Math.min(1000, next), roleId: "" },
    ]);
  }
  function removeReward(i: number) {
    set(
      "roleRewards",
      config.roleRewards.filter((_, ri) => ri !== i),
    );
  }

  // ---- XP multipliers ----
  function setMultiplier(i: number, patch: Partial<XpMultiplierRole>) {
    set(
      "xpMultiplierRoles",
      config.xpMultiplierRoles.map((m, mi) =>
        mi === i ? { ...m, ...patch } : m,
      ),
    );
  }
  function addMultiplier() {
    set("xpMultiplierRoles", [
      ...config.xpMultiplierRoles,
      { roleId: "", multiplier: 2 },
    ]);
  }
  function removeMultiplier(i: number) {
    set(
      "xpMultiplierRoles",
      config.xpMultiplierRoles.filter((_, mi) => mi !== i),
    );
  }

  // ---- Channel multipliers ----
  function setChannelMult(i: number, patch: Partial<ChannelMultiplier>) {
    set(
      "channelMultipliers",
      config.channelMultipliers.map((m, mi) =>
        mi === i ? { ...m, ...patch } : m,
      ),
    );
  }
  function addChannelMult() {
    set("channelMultipliers", [
      ...config.channelMultipliers,
      { channelId: "", multiplier: 2 },
    ]);
  }
  function removeChannelMult(i: number) {
    set(
      "channelMultipliers",
      config.channelMultipliers.filter((_, mi) => mi !== i),
    );
  }

  // Empty roleIds are placeholders from "Add"; the schema would reject them, so
  // they must not reach the save.
  const incomplete =
    config.roleRewards.some((r) => !r.roleId) ||
    config.xpMultiplierRoles.some((m) => !m.roleId) ||
    config.channelMultipliers.some((m) => !m.channelId);

  const avgXp = (config.xpPerMessageMin + config.xpPerMessageMax) / 2;
  const perMinute = config.cooldownSec > 0 ? 60 / config.cooldownSec : 0;

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">XP earning</div>
        <Toggle
          label="Enable leveling"
          hint="Members earn XP for messages and level up on the MEE6 curve."
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Minimum XP per message</label>
            <input
              type="number"
              className="input"
              min={0}
              max={1000}
              value={config.xpPerMessageMin}
              onChange={(e) =>
                set("xpPerMessageMin", Number(e.target.value) || 0)
              }
            />
          </div>
          <div>
            <label className="label">Maximum XP per message</label>
            <input
              type="number"
              className="input"
              min={0}
              max={1000}
              value={config.xpPerMessageMax}
              onChange={(e) =>
                set("xpPerMessageMax", Number(e.target.value) || 0)
              }
            />
          </div>
          <div>
            <label className="label">Cooldown (seconds)</label>
            <input
              type="number"
              className="input"
              min={0}
              max={3600}
              value={config.cooldownSec}
              onChange={(e) => set("cooldownSec", Number(e.target.value) || 0)}
            />
          </div>
        </div>

        {config.xpPerMessageMin > config.xpPerMessageMax && (
          <p className="text-xs text-amber-400">
            Minimum is above maximum. Swap them before saving.
          </p>
        )}

        <p className="text-xs text-zinc-500">
          A member earns XP at most once every {config.cooldownSec}s, so the
          fastest anyone can climb is about{" "}
          <span className="text-zinc-300">
            {Math.round(avgXp * perMinute).toLocaleString()} XP per minute
          </span>{" "}
          of constant chatting. Level 10 costs{" "}
          {xpForLevel(10).toLocaleString()} XP; level 50 costs{" "}
          {xpForLevel(50).toLocaleString()} XP.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Voice XP</div>
        <Toggle
          label="Earn XP in voice channels"
          hint="Members earn XP per minute spent in a call, not just for typing."
          checked={config.voiceXpEnabled}
          onChange={(v) => set("voiceXpEnabled", v)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">XP per minute</label>
            <input
              type="number"
              className="input"
              min={0}
              max={100}
              value={config.voiceXpPerMinute}
              onChange={(e) =>
                set("voiceXpPerMinute", Number(e.target.value) || 0)
              }
            />
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
              more, or someone can idle alone overnight and top the leaderboard.
            </p>
          </div>
        </div>

        <Toggle
          label="No XP in the AFK channel"
          checked={config.voiceIgnoreAfk}
          onChange={(v) => set("voiceIgnoreAfk", v)}
        />
        <Toggle
          label="No XP while self-muted or deafened"
          hint="Muted means not participating. Server mutes are a moderation action and are not counted here either way."
          checked={config.voiceIgnoreMuted}
          onChange={(v) => set("voiceIgnoreMuted", v)}
        />
        <MultiSelect
          label="Voice channels that earn no XP"
          values={config.voiceIgnoreChannelIds}
          onChange={(v) => set("voiceIgnoreChannelIds", v)}
          options={voiceChannels}
          prefix="🔊"
          emptyText="No ignored voice channels"
        />

        <p className="text-xs text-zinc-500">
          At {config.voiceXpPerMinute} XP a minute, an hour in a call is{" "}
          <span className="text-zinc-300">
            {(config.voiceXpPerMinute * 60 * config.xpRate).toLocaleString()} XP
          </span>{" "}
          after the XP rate below. The roles on the &ldquo;no XP&rdquo; list
          apply here too.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Level-up announcements</div>
        <Toggle
          label="Announce level-ups"
          checked={config.announceLevelUp}
          onChange={(v) => set("announceLevelUp", v)}
        />
        <Toggle
          label="Send it as a DM instead"
          hint="Nobody sees level-ups in chat. If their DMs are closed it falls back to the announcement channel below."
          checked={config.levelUpDm}
          onChange={(v) => set("levelUpDm", v)}
        />
        <Select
          label="Announcement channel"
          hint="Leave as None to reply in whichever channel they levelled up in."
          value={config.announceChannelId}
          onChange={(v) => set("announceChannelId", v)}
          options={channels}
          prefix="#"
          placeholder="None (reply in place)"
        />
        <div>
          <label className="label">Announcement message</label>
          <textarea
            className="input min-h-16"
            value={config.announceMessage}
            onChange={(e) => set("announceMessage", e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            {"{user}"} mentions them, {"{username}"} is their name, {"{level}"}{" "}
            is the new level, {"{server}"} is the server name.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Preview:{" "}
            <span className="text-zinc-300">
              {renderLevelUp(config.announceMessage, {
                userId: "0",
                username: "Member",
                level: 5,
                serverName: "Your Server",
              }).replace("<@0>", "@Member")}
            </span>
          </p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Role rewards</div>
        <Toggle
          label="Keep every reward role"
          hint="Off (recommended for a colored rank ladder): reaching a new reward removes the previous one."
          checked={config.stackRoleRewards}
          onChange={(v) => set("stackRoleRewards", v)}
        />
        <Toggle
          label="Take the role back on a level down"
          hint="When staff remove XP with /xp take or /xp set and a member falls below a reward's level, the role goes with it."
          checked={config.removeRoleOnLevelDown}
          onChange={(v) => set("removeRoleOnLevelDown", v)}
        />

        {config.roleRewards.length === 0 && (
          <p className="text-sm text-zinc-500">
            No rewards yet. Add one to grant a role automatically at a level.
          </p>
        )}

        {config.roleRewards.map((reward, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="w-28 flex-none">
              <label className="label">At level</label>
              <input
                type="number"
                className="input"
                min={1}
                max={1000}
                value={reward.level}
                onChange={(e) =>
                  setReward(i, { level: Number(e.target.value) || 1 })
                }
              />
            </div>
            <div className="flex-1">
              <Select
                label="Grant this role"
                value={reward.roleId || undefined}
                onChange={(v) => setReward(i, { roleId: v ?? "" })}
                options={grantableRoles}
                prefix="@"
                placeholder="Pick a role"
              />
            </div>
            <button
              type="button"
              className="btn mb-0.5 bg-red-600/80 text-white hover:bg-red-500"
              onClick={() => removeReward(i)}
            >
              Remove
            </button>
          </div>
        ))}

        <button type="button" className="btn" onClick={addReward}>
          + Add reward
        </button>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">XP multipliers</div>
        <p className="text-sm text-zinc-400">
          Give boosters or patrons faster XP without changing the base rate.
          Multipliers do not stack: a member with several of these gets the
          highest one, not the product.
        </p>

        {config.xpMultiplierRoles.map((mult, i) => (
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
        <div className="font-medium text-white">Channel multipliers</div>
        <p className="text-sm text-zinc-400">
          Weight XP per channel: half rate in #general, double in #events. This
          one does stack with the role multiplier above, so a booster in a
          double-XP channel really does get both.
        </p>

        {config.channelMultipliers.map((mult, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="flex-1">
              <Select
                label="Channel"
                value={mult.channelId || undefined}
                onChange={(v) => setChannelMult(i, { channelId: v ?? "" })}
                options={channels}
                prefix="#"
                placeholder="Pick a channel"
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
                  setChannelMult(i, { multiplier: Number(e.target.value) || 0 })
                }
              />
            </div>
            <button
              type="button"
              className="btn mb-0.5 bg-red-600/80 text-white hover:bg-red-500"
              onClick={() => removeChannelMult(i)}
            >
              Remove
            </button>
          </div>
        ))}

        <button type="button" className="btn" onClick={addChannelMult}>
          + Add channel multiplier
        </button>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Rate and visibility</div>
        <div>
          <label className="label">Server XP rate</label>
          <input
            type="number"
            className="input max-w-40"
            min={0.25}
            max={3}
            step={0.25}
            value={config.xpRate}
            onChange={(e) => set("xpRate", Number(e.target.value) || 1)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            One dial over everything, message and voice XP alike. 1 is normal, 2
            is a double-XP weekend, 0.5 makes levels twice as hard to reach.
          </p>
        </div>

        <Toggle
          label="Public leaderboard page"
          hint="Serves /leaderboard/<server id> to anyone with the link, no login. Off keeps member XP visible to staff only."
          checked={config.publicLeaderboard}
          onChange={(v) => set("publicLeaderboard", v)}
        />
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Ignore lists</div>
        <MultiSelect
          label="Channels that earn no XP"
          hint="Spam, bot-commands, counting: anywhere activity is not really conversation."
          values={config.ignoreChannelIds}
          onChange={(v) => set("ignoreChannelIds", v)}
          options={channels}
          prefix="#"
          emptyText="No ignored channels"
        />
        <MultiSelect
          label="Roles that earn no XP"
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
          disabled={pending || incomplete}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {incomplete && (
          <span className="text-sm text-amber-400">
            Pick a role for every reward and multiplier first.
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
