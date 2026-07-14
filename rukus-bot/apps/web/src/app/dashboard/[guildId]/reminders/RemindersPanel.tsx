"use client";

import { useState, useTransition } from "react";
import type { RemindersConfig } from "@rukus/shared";
import { formatDuration } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { saveRemindersConfig, deleteReminder } from "../utility-actions";

export interface ReminderRow {
  id: string;
  userId: string;
  channelId: string;
  text: string;
  dueAt: string;
  repeatSec: number | null;
}

export function RemindersPanel({
  guildId,
  initial,
  reminders,
}: {
  guildId: string;
  initial: RemindersConfig;
  reminders: ReminderRow[];
}) {
  const [config, setConfig] = useState<RemindersConfig>(initial);
  const [rows, setRows] = useState<ReminderRow[]>(reminders);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveRemindersConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  function onDelete(id: string) {
    if (!confirm("Cancel this reminder? The member won't be told.")) return;
    startTransition(async () => {
      const res = await deleteReminder(guildId, id);
      if (res.ok) {
        // Drop it locally too: revalidatePath refreshes the server data, but the
        // row should disappear the instant they click, not a round-trip later.
        setRows((r) => r.filter((x) => x.id !== id));
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle
          label="Enable /remind"
          checked={config.enabled}
          onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
        />
        <div>
          <label className="label">Maximum reminders per member</label>
          <input
            type="number"
            className="input max-w-32"
            min={1}
            max={100}
            value={config.maxPerUser}
            onChange={(e) =>
              setConfig((c) => ({ ...c, maxPerUser: Number(e.target.value) }))
            }
          />
          <p className="mt-1 text-xs text-zinc-500">
            Stops one member queueing thousands of timers.
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

      <div>
        <h2 className="mb-3 font-medium text-white">
          Pending reminders ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <div className="card text-zinc-400">
            Nothing queued. They&apos;ll show up here as members set them.
          </div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-zinc-400">
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Reminder</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Repeats</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-edge/50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">
                      {r.userId}
                    </td>
                    <td className="max-w-sm truncate px-4 py-2.5 text-zinc-200">
                      {r.text}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400">
                      {new Date(r.dueAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">
                      {r.repeatSec ? `every ${formatDuration(r.repeatSec)}` : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        className="text-red-400 hover:underline"
                        onClick={() => onDelete(r.id)}
                        disabled={pending}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
