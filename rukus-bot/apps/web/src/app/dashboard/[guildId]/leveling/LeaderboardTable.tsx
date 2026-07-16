"use client";

import { useState } from "react";
import { levelProgress } from "@rukus/shared";
import type { LeaderboardRow } from "@rukus/supabase";

/**
 * The dashboard leaderboard.
 *
 * The progress bar is computed with levelProgress() from @rukus/shared, the
 * exact function the bot's /rank embed uses. That is the whole reason the curve
 * math lives in shared: staff never see a percentage here that contradicts what
 * a member was just told in Discord.
 */

const MEDALS = ["🥇", "🥈", "🥉"];

/** A leaderboard row with the member's display name resolved by the server. */
export type NamedLeaderboardRow = LeaderboardRow & { name: string };

export function LeaderboardTable({ rows }: { rows: NamedLeaderboardRow[] }) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  // Names are resolved server-side in one batched fetch, so search covers both
  // the display name and the raw id.
  const filtered = q
    ? rows.filter(
        (r) => r.name.toLowerCase().includes(q) || r.userId.includes(q),
      )
    : rows;

  if (rows.length === 0) {
    return (
      <div className="card text-zinc-400">
        Nobody has earned XP yet. Turn leveling on above and the leaderboard
        fills in as people talk.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        className="input max-w-sm"
        placeholder="Search by name or user ID…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="card text-zinc-400">Nothing matches that search.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-zinc-400">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Total XP</th>
                <th className="px-4 py-3">Messages</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const place = rows.indexOf(r) + 1;
                const p = levelProgress(r.xp);
                return (
                  <tr
                    key={r.userId}
                    className="border-b border-edge/50 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-mono text-zinc-400">
                      {MEDALS[place - 1] ?? `#${place}`}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-200" title={r.userId}>
                      {r.name}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-white">
                      {p.level}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-28 flex-none overflow-hidden rounded-full bg-edge">
                          <div
                            className="h-full rounded-full bg-blurple"
                            style={{ width: `${Math.round(p.ratio * 100)}%` }}
                          />
                        </div>
                        <span className="whitespace-nowrap text-xs text-zinc-500">
                          {p.currentXp.toLocaleString()}/
                          {p.neededXp.toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {r.xp.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">
                      {r.messages.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
