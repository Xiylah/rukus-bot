"use client";

import { useState, useTransition } from "react";
import { disqualifyEntry } from "./actions";

/**
 * The running contest's entries as a grid of thumbnails.
 *
 * A grid rather than a table because the thing staff are actually judging is
 * the picture, and a table of URLs makes them open twenty tabs to see it.
 */

export interface GalleryEntry {
  id: string;
  userId: string;
  userName: string;
  mediaUrl: string;
  votes: number;
  messageLink: string;
}

export interface PastContest {
  id: string;
  title: string;
  endsAt: string;
  winners: { userId: string; userName: string }[];
}

/** Videos and unknown hosts cannot be shown in an <img>, so we label them. */
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|bmp|avif)(\?|#|$)/i;

function isDisplayableImage(url: string): boolean {
  if (!url) return false;
  // A direct image URL renders; a YouTube or Streamable link is a page, and
  // pointing an <img> at it just shows a broken icon.
  return IMAGE_EXTENSION.test(url);
}

function EntryCard({
  entry,
  onDisqualify,
  pending,
}: {
  entry: GalleryEntry;
  onDisqualify: (entry: GalleryEntry) => void;
  pending: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-panel">
      <a
        href={entry.messageLink}
        target="_blank"
        rel="noreferrer"
        className="block aspect-video bg-black/40"
      >
        {isDisplayableImage(entry.mediaUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element -- Discord CDN
          // URLs are signed and expire, so next/image's optimiser cannot cache
          // them and would just proxy a 403.
          <img
            src={entry.mediaUrl}
            alt={`Entry by ${entry.userName}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-zinc-400">
            {entry.mediaUrl ? "🎬 Open the linked media" : "No media recorded"}
          </div>
        )}
      </a>

      <div className="space-y-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-white">
            {entry.userName}
          </span>
          <span className="shrink-0 text-xs text-zinc-400">
            {entry.votes} vote{entry.votes === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={entry.messageLink}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-400 hover:underline"
          >
            View message
          </a>
          <button
            className="ml-auto rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            onClick={() => onDisqualify(entry)}
            disabled={pending}
          >
            Disqualify
          </button>
        </div>
      </div>
    </div>
  );
}

export function EntryGallery({
  guildId,
  contestTitle,
  contestEndsAt,
  initialEntries,
  pastContests,
}: {
  guildId: string;
  contestTitle: string | null;
  contestEndsAt: string | null;
  initialEntries: GalleryEntry[];
  pastContests: PastContest[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onDisqualify(entry: GalleryEntry) {
    if (
      !confirm(
        `Disqualify ${entry.userName}'s entry? It can no longer win. Their message stays up.`,
      )
    ) {
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const res = await disqualifyEntry(guildId, entry.id);
      if (res.ok) {
        // Drop it locally too: revalidatePath refreshes the server data, but the
        // card should disappear the instant they click, not a round-trip later.
        setEntries((list) => list.filter((e) => e.id !== entry.id));
        setMsg({ ok: true, text: `Disqualified ${entry.userName}'s entry.` });
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-medium text-white">
            {contestTitle ? `Running: ${contestTitle}` : "Entries"}
          </div>
          {contestEndsAt && (
            <span className="text-xs text-zinc-400">
              Ends {new Date(contestEndsAt).toLocaleString()}
            </span>
          )}
        </div>

        {!contestTitle ? (
          <p className="text-sm text-zinc-400">
            No contest is running right now. Start one with{" "}
            <code className="rounded bg-panel px-1">/contest start</code>, or
            turn on a recurring schedule below.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Nobody has entered yet. Members enter by posting an image or video in
            the contest channel.
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              {entries.length} entr{entries.length === 1 ? "y" : "ies"}. Vote
              counts are the snapshot from the last time the bot counted, so a
              running contest shows 0 until it ends.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onDisqualify={onDisqualify}
                  pending={pending}
                />
              ))}
            </div>
          </>
        )}

        {msg && (
          <span className={msg.ok ? "text-green-400" : "text-red-400"}>
            {msg.text}
          </span>
        )}
      </div>

      {pastContests.length > 0 && (
        <div className="card space-y-3">
          <div className="font-medium text-white">Past contests</div>
          <div className="space-y-2">
            {pastContests.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-edge bg-panel px-3 py-2"
              >
                <div>
                  <div className="text-sm text-white">{c.title}</div>
                  <div className="text-xs text-zinc-500">
                    Ended {new Date(c.endsAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-xs text-zinc-400">
                  {c.winners.length > 0
                    ? c.winners.map((w, i) => (
                        <span key={w.userId} className="ml-1">
                          {["🥇", "🥈", "🥉"][i] ?? `#${i + 1}`} {w.userName}
                        </span>
                      ))
                    : "No winners"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
