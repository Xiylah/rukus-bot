"use client";

import { useState, useTransition } from "react";
import type { AutoRolesConfig, TimedRole } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { saveAutoRolesConfig } from "../utility-actions";

/** Human duration -> seconds, for the timed-role delay picker. */
const DELAY_CHOICES: { label: string; sec: number }[] = [
  { label: "5 minutes", sec: 300 },
  { label: "30 minutes", sec: 1800 },
  { label: "1 hour", sec: 3600 },
  { label: "6 hours", sec: 21_600 },
  { label: "1 day", sec: 86_400 },
  { label: "3 days", sec: 259_200 },
  { label: "7 days", sec: 604_800 },
  { label: "30 days", sec: 2_592_000 },
];

export function AutoRolesForm({
  guildId,
  initial,
  roles,
  allRoles,
}: {
  guildId: string;
  initial: AutoRolesConfig;
  roles: Option[];
  allRoles: Option[];
}) {
  const [config, setConfig] = useState<AutoRolesConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof AutoRolesConfig>(key: K, value: AutoRolesConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function setTimed(index: number, patch: Partial<TimedRole>) {
    set(
      "timedRoles",
      config.timedRoles.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  }

  function addTimed() {
    const first = roles[0];
    if (!first) return;
    set("timedRoles", [...config.timedRoles, { roleId: first.id, delaySec: 3600 }]);
  }

  function removeTimed(index: number) {
    set(
      "timedRoles",
      config.timedRoles.filter((_, i) => i !== index),
    );
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveAutoRolesConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle
          label="Enable auto-roles"
          hint="Turn this off and nothing below applies."
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">On join</div>
        <MultiSelect
          label="Roles for new members"
          hint="Given the moment a human joins."
          values={config.joinRoleIds}
          onChange={(v) => set("joinRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="No roles on join"
        />
        <MultiSelect
          label="Roles for bots"
          hint="Bots get these INSTEAD of the roles above, so they skip member-only roles."
          values={config.botRoleIds}
          onChange={(v) => set("botRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="No roles for bots"
        />
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Timed roles</div>
        <p className="text-sm text-zinc-400">
          Granted a while after joining. Useful for a &quot;trusted&quot; role
          that raid accounts never stick around long enough to earn.
        </p>

        {config.timedRoles.length === 0 && (
          <p className="text-sm text-zinc-500">No timed roles yet.</p>
        )}

        {config.timedRoles.map((timed, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3 rounded-md border border-edge p-3">
            <div className="min-w-48 flex-1">
              <Select
                label="Role"
                value={timed.roleId}
                onChange={(v) => setTimed(i, { roleId: v ?? "" })}
                options={roles}
                prefix="@"
                placeholder="Pick a role"
              />
            </div>
            <div className="min-w-40">
              <label className="label">After</label>
              <select
                className="input"
                value={timed.delaySec}
                onChange={(e) => setTimed(i, { delaySec: Number(e.target.value) })}
              >
                {DELAY_CHOICES.map((d) => (
                  <option key={d.sec} value={d.sec}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn bg-red-600 text-white hover:bg-red-500"
              onClick={() => removeTimed(i)}
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          className="btn"
          onClick={addTimed}
          disabled={config.timedRoles.length >= 25 || roles.length === 0}
        >
          + Add a timed role
        </button>
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Restore roles on rejoin</div>
        <Toggle
          label="Give returning members their roles back"
          hint="Their roles are saved when they leave and handed back if they come back."
          checked={config.restoreRoles}
          onChange={(v) => set("restoreRoles", v)}
        />
        {config.restoreRoles && (
          <>
            <MultiSelect
              label="Never restore these roles"
              hint="Put the muted role and every staff role here."
              values={config.restoreBlockedRoleIds}
              onChange={(v) => set("restoreBlockedRoleIds", v)}
              options={allRoles}
              prefix="@"
              emptyText="Nothing blocked"
            />
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              <strong>Read this.</strong> Without a block list, leaving and
              rejoining is a free way to dodge a mute: the muted role comes off
              when they leave, and staff roles you removed while they were gone
              would come straight back. Add your muted role and every staff role
              above.
            </div>
          </>
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
