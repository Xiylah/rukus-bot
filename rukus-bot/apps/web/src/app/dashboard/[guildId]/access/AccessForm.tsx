"use client";

import { useState, useTransition } from "react";
import type { AccessConfig } from "@rukus/shared";
import { MultiSelect, type Option } from "@/components/Pickers";
import { saveAccessConfig } from "../actions";

export function AccessForm({
  guildId,
  initial,
  roles,
  members,
}: {
  guildId: string;
  initial: AccessConfig;
  roles: Option[];
  members: Option[];
}) {
  const [config, setConfig] = useState<AccessConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveAccessConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <MultiSelect
          label="Staff roles"
          hint="Members with any of these roles can log in and change settings - but not this page."
          values={config.staffRoleIds}
          onChange={(v) => setConfig((c) => ({ ...c, staffRoleIds: v }))}
          options={roles}
          prefix="@"
          emptyText="No roles - only Administrators can use the dashboard"
        />
        <MultiSelect
          label="Individual users (optional)"
          hint="Grant access to specific people without giving them a role."
          values={config.allowUserIds}
          onChange={(v) => setConfig((c) => ({ ...c, allowUserIds: v }))}
          options={members}
          emptyText="No individual users"
        />
      </div>

      <div className="card border-amber-500/30 bg-amber-500/5">
        <div className="text-sm text-amber-200/90">
          <strong>Note:</strong> staff you grant access to can change every other
          settings page, but cannot see or edit this Access page - so they can&apos;t
          grant themselves or anyone else more access. Only server Administrators
          can.
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
