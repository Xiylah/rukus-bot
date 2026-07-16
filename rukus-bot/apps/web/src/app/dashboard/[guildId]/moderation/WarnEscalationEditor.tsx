"use client";

import type { ModerationConfig } from "@rukus/shared";

type Rung = ModerationConfig["warnEscalation"][number];

/**
 * Editor for the warn-escalation ladder and warn expiry. Kept in its own
 * component so ModerationForm only has to drop it in, matching the role-rewards
 * pattern in LevelingForm (numeric threshold + action row, add/remove).
 *
 * The parent owns the config state; this component is a controlled editor that
 * reports every change back through onChange.
 */
export function WarnEscalationEditor({
  rungs,
  expiryDays,
  onChangeRungs,
  onChangeExpiry,
}: {
  rungs: Rung[];
  expiryDays: number;
  onChangeRungs: (rungs: Rung[]) => void;
  onChangeExpiry: (days: number) => void;
}) {
  function setRung(i: number, patch: Partial<Rung>) {
    onChangeRungs(rungs.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
  }
  function addRung() {
    const next = Math.max(0, ...rungs.map((r) => r.warns)) + 1;
    onChangeRungs([
      ...rungs,
      { warns: Math.min(100, next), action: "timeout", durationMin: 60 },
    ]);
  }
  function removeRung(i: number) {
    onChangeRungs(rungs.filter((_, ri) => ri !== i));
  }

  return (
    <div className="card space-y-4">
      <div>
        <div className="font-medium text-white">Warn escalation</div>
        <p className="mt-1 text-sm text-zinc-400">
          Auto-punish a member once their warn count reaches a rung. The highest
          rung a member has reached wins (e.g. ban at 7 beats kick at 5). Each
          auto-action is recorded as its own case and DMs the member if
          &ldquo;DM the member when actioned&rdquo; is on.
        </p>
      </div>

      {rungs.length === 0 && (
        <p className="text-sm text-zinc-500">
          No rungs yet. Add one to start the ladder, e.g. timeout at 3 warns.
        </p>
      )}

      {rungs.map((rung, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3">
          <div className="w-28 flex-none">
            <label className="label">At warns</label>
            <input
              type="number"
              className="input"
              min={1}
              max={100}
              value={rung.warns}
              onChange={(e) =>
                setRung(i, { warns: Number(e.target.value) || 1 })
              }
            />
          </div>
          <div className="w-40 flex-none">
            <label className="label">Do</label>
            <select
              className="input"
              value={rung.action}
              onChange={(e) =>
                setRung(i, { action: e.target.value as Rung["action"] })
              }
            >
              <option value="timeout">Timeout</option>
              <option value="kick">Kick</option>
              <option value="ban">Ban</option>
            </select>
          </div>
          {rung.action === "timeout" && (
            <div className="w-40 flex-none">
              <label className="label">For (minutes)</label>
              <input
                type="number"
                className="input"
                min={1}
                max={40320}
                value={rung.durationMin}
                onChange={(e) =>
                  setRung(i, { durationMin: Number(e.target.value) || 60 })
                }
              />
            </div>
          )}
          <button
            type="button"
            className="btn mb-0.5 bg-red-600/80 text-white hover:bg-red-500"
            onClick={() => removeRung(i)}
          >
            Remove
          </button>
        </div>
      ))}

      <button type="button" className="btn" onClick={addRung}>
        + Add rung
      </button>

      <div className="border-t border-zinc-800 pt-4">
        <label className="label">Warns expire after (days)</label>
        <input
          type="number"
          className="input max-w-40"
          min={0}
          max={3650}
          value={expiryDays}
          onChange={(e) => onChangeExpiry(Number(e.target.value) || 0)}
        />
        <p className="mt-1 text-xs text-zinc-500">
          0 = warns never expire. Otherwise a warn older than this stops counting
          toward escalation (and shows as expired in /history).
        </p>
      </div>
    </div>
  );
}
