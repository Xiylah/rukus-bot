"use client";

import { useState } from "react";

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

export function CasesTable({ cases }: { cases: CaseRow[] }) {
  const [query, setQuery] = useState("");

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

  return (
    <div className="space-y-4">
      <input
        className="input max-w-sm"
        placeholder="Search by user, reason, or action…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

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
