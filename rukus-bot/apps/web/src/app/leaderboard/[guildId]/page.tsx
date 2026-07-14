import type { Metadata } from "next";
import Link from "next/link";
import { getLevelingConfig, getLeaderboardPage } from "@rukus/supabase";
import { levelProgress } from "@rukus/shared";
import { fetchPublicGuild, fetchMemberIdentities } from "./data";

/**
 * The PUBLIC leaderboard: /leaderboard/<guildId>, no login.
 *
 * Two gates before a single row is read: the bot must actually be in the guild,
 * and config.publicLeaderboard must be on. A server that opts out leaks nothing,
 * not even how many members have XP, so the private page below is deliberately
 * identical whether the guild is private or does not exist.
 *
 * Only the top 100 are ever served. Beyond being the page everyone wants, it
 * caps the exposure of a public endpoint: this is not a member directory.
 */

const PER_PAGE = 25;
const MAX_ROWS = 100;
const MEDALS = ["🥇", "🥈", "🥉"];

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "The top members by XP.",
};

function PrivateNotice() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-white">Leaderboard unavailable</h1>
      <p className="mt-3 text-zinc-400">
        This server&apos;s leaderboard is private, or the server does not use
        Rukus.
      </p>
      <Link href="/" className="btn-ghost mt-6">
        Back to Rukus
      </Link>
    </main>
  );
}

export default async function PublicLeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { guildId } = await params;
  const { page: rawPage } = await searchParams;

  // A malformed id must not reach the API or the database.
  if (!/^\d{17,20}$/.test(guildId)) return <PrivateNotice />;

  const [config, guild] = await Promise.all([
    getLevelingConfig(guildId),
    fetchPublicGuild(guildId),
  ]);

  if (!guild || !config.enabled || !config.publicLeaderboard) {
    return <PrivateNotice />;
  }

  const pages = Math.ceil(MAX_ROWS / PER_PAGE);
  const page = Math.min(Math.max(1, Number(rawPage) || 1), pages);
  const offset = (page - 1) * PER_PAGE;

  const { rows, total } = await getLeaderboardPage(guildId, offset, PER_PAGE);
  const ranked = Math.min(total, MAX_ROWS);
  const identities = await fetchMemberIdentities(
    guildId,
    rows.map((r) => r.userId),
  );

  const lastPage = Math.max(1, Math.ceil(ranked / PER_PAGE));

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <div className="mb-8 flex items-center gap-4">
        {guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guild.iconUrl}
            alt=""
            className="h-14 w-14 flex-none rounded-full"
          />
        ) : (
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-card text-xl font-semibold text-zinc-300">
            {guild.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{guild.name}</h1>
          <p className="text-sm text-zinc-400">
            Top {Math.min(MAX_ROWS, ranked || MAX_ROWS)} members by XP
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card text-zinc-400">
          Nobody has earned XP here yet.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-zinc-400">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3 text-right">Total XP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const place = offset + i + 1;
                const who = identities.get(row.userId);
                const p = levelProgress(row.xp);
                return (
                  <tr
                    key={row.userId}
                    className="border-b border-edge/50 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-mono text-zinc-400">
                      {MEDALS[place - 1] ?? `#${place}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {who && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={who.avatarUrl}
                            alt=""
                            className="h-6 w-6 flex-none rounded-full"
                          />
                        )}
                        <span className="text-zinc-200">
                          {who?.name ?? row.userId}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-white">
                      {p.level}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 flex-none overflow-hidden rounded-full bg-edge">
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
                    <td className="px-4 py-2.5 text-right text-zinc-300">
                      {row.xp.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {lastPage > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/leaderboard/${guildId}?page=${page - 1}`}
              className="btn-ghost"
            >
              Previous
            </Link>
          ) : (
            <span className="btn-ghost opacity-40">Previous</span>
          )}
          <span className="text-zinc-500">
            Page {page} of {lastPage}
          </span>
          {page < lastPage ? (
            <Link
              href={`/leaderboard/${guildId}?page=${page + 1}`}
              className="btn-ghost"
            >
              Next
            </Link>
          ) : (
            <span className="btn-ghost opacity-40">Next</span>
          )}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-zinc-600">
        Powered by{" "}
        <Link href="/" className="text-zinc-400 hover:text-white">
          Rukus
        </Link>
      </p>
    </main>
  );
}
