"use client";

import { useState } from "react";

/**
 * The live balance leaderboard.
 *
 * Amounts arrive as strings, not numbers: the column is a BigInt and a mature
 * economy can pass 2^53, where a JS number silently starts rounding. They are
 * only ever formatted here, never summed or compared as numbers.
 */

const MEDALS = ["🥇", "🥈", "🥉"];

export interface NamedBalanceRow {
  userId: string;
  /** Decimal string, straight from the BigInt column. */
  amount: string;
  lifetime: string;
  dailyStreak: number;
  name: string;
}

/** Group a decimal string with thousands separators, without going via Number. */
function group(value: string): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

export function BalanceTable({
  rows,
  symbol,
  currencyName,
}: {
  rows: NamedBalanceRow[];
  symbol: string;
  currencyName: string;
}) {
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
        Nobody has earned any {currencyName} yet. Turn the economy on above and
        this fills in as people talk.
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
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Earned all time</th>
                <th className="px-4 py-3">Daily streak</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const place = rows.indexOf(r) + 1;
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
                      {symbol} {group(r.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {group(r.lifetime)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">
                      {r.dailyStreak > 0 ? `${r.dailyStreak} days` : "-"}
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
