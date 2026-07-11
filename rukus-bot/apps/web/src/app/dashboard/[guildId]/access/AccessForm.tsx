"use client";

import { useState, useTransition } from "react";
import type { AccessConfig } from "@rukus/shared";
import { saveAccessConfig } from "../actions";

export function AccessForm({
  guildId,
  initial,
}: {
  guildId: string;
  initial: AccessConfig;
}) {
  const [rolesText, setRolesText] = useState(initial.staffRoleIds.join(", "));
  const [usersText, setUsersText] = useState(initial.allowUserIds.join(", "));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function parseIds(text: string): string[] {
    return text
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{17,20}$/.test(s));
  }

  function onSave() {
    setMsg(null);
    const payload: AccessConfig = {
      staffRoleIds: parseIds(rolesText),
      allowUserIds: parseIds(usersText),
    };
    startTransition(async () => {
      const res = await saveAccessConfig(guildId, payload);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div>
          <label className="label">Staff role IDs</label>
          <input
            className="input"
            placeholder="Comma or space separated, e.g. 123..., 456..."
            value={rolesText}
            onChange={(e) => setRolesText(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Members with any of these roles can log in and edit settings (but not
            this Access page — only Manage Server can change who has access).
          </p>
        </div>
        <div>
          <label className="label">Allowed user IDs (optional)</label>
          <input
            className="input"
            placeholder="Specific users always allowed"
            value={usersText}
            onChange={(e) => setUsersText(e.target.value)}
          />
        </div>
        <p className="text-xs text-zinc-500">
          Enable Discord Developer Mode → right-click a role or user → Copy ID.
        </p>
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
