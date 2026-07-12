"use client";

import { useState, useTransition } from "react";
import { deleteCases } from "../actions";

export interface CaseRow {
  number: number;
  action: string;
  userId: string;
  userTag: string;
  moderatorId: string;
  reason: string;
  durationMin: number | null;
  createdAt: string;
  proofToken: string | null;
}

const ACTION_BADGE: Record<string, string> = {
  WARN: "bg-yellow-500/20 text-yellow-300",
  TIMEOUT: "bg-yellow-500/20 text-yellow-300",
  UNTIMEOUT: "bg-green-500/20 text-green-300",
  MUTE: "bg-orange-500/20 text-orange-300",
  UNMUTE: "bg-green-500/20 text-green-300",
  KICK: "bg-red-500/20 text-red-300",
  BAN: "bg-red-500/20 text-red-300",
  UNBAN: "bg-green-500/20 text-green-300",
};

function fmtDuration(min: number | null): string {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

export function CasesTable({
  cases,
  guildId,
  canDelete,
}: {
  cases: CaseRow[];
  guildId: string;
  canDelete: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? cases.filter(
        (c) =>
          c.userTag.toLowerCase().includes(q) ||
          c.userId.includes(q) ||
          c.reason.toLowerCase().includes(q) ||
          c.action.toLowerCase().includes(q),
      )
    : cases;

  function toggle(n: number) {
    setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  }
  function toggleAll() {
    const shown = filtered.map((c) => c.number);
    const allSelected = shown.every((n) => selected.includes(n));
    setSelected(allSelected ? [] : shown);
  }
  function onDelete() {
    if (selected.length === 0) return;
    if (
      !confirm(
        `Permanently delete ${selected.length} case(s)? This can't be undone.`,
      )
    ) {
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const res = await deleteCases(guildId, selected);
      if (res.ok) {
        setMsg(`Deleted ${selected.length} case(s).`);
        setSelected([]);
      } else {
        setMsg(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-sm"
          placeholder="Search by user, reason, or action…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {canDelete && selected.length > 0 && (
          <button
            type="button"
            className="btn bg-red-600 text-white hover:bg-red-500"
            onClick={onDelete}
            disabled={pending}
          >
            {pending
              ? "Deleting…"
              : `Delete ${selected.length} selected case(s)`}
          </button>
        )}
        {msg && <span className="text-sm text-zinc-400">{msg}</span>}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-zinc-400">
          {cases.length === 0
            ? "No cases yet. They'll appear when staff use /warn, /timeout, /kick or /ban."
            : "Nothing matches that search."}
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-zinc-400">
                {canDelete && (
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 &&
                        filtered.every((c) => selected.includes(c.number))
                      }
                      onChange={toggleAll}
                      title="Select all shown"
                    />
                  </th>
                )}
                <th className="px-4 py-3">Case</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Moderator</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Proof</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.number} className="border-b border-edge/50 last:border-0">
                  {canDelete && (
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.includes(c.number)}
                        onChange={() => toggle(c.number)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-2.5 font-mono text-zinc-400">
                    #{String(c.number).padStart(4, "0")}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${ACTION_BADGE[c.action] ?? "bg-zinc-600/30 text-zinc-300"}`}
                    >
                      {c.action}
                      {c.durationMin ? ` ${fmtDuration(c.durationMin)}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-white">{c.userTag}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">
                    {c.moderatorId}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-zinc-300">
                    {c.reason || "no reason"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400">
                    {new Date(c.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.proofToken ? (
                      <a
                        href={`/proof/${c.proofToken}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blurple hover:underline"
                      >
                        📎 View
                      </a>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
