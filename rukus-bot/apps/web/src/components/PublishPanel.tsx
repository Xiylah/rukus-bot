"use client";

import { useState, useTransition } from "react";
import { Select, type Option } from "@/components/Pickers";
import { publishTicketPanel, publishFormsPanel } from "@/app/dashboard/[guildId]/actions";

/**
 * "Post to Discord" card: pick a channel, click, and the panel appears there
 * immediately. Re-publishing to the same channel UPDATES the existing message
 * instead of posting a duplicate.
 */
export function PublishPanel({
  guildId,
  kind,
  channels,
  currentChannelId,
}: {
  guildId: string;
  kind: "tickets" | "forms";
  channels: Option[];
  /** Where the panel currently lives, if it was published before. */
  currentChannelId?: string;
}) {
  const [channelId, setChannelId] = useState<string | undefined>(currentChannelId);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onPublish() {
    if (!channelId) {
      setMsg({ ok: false, text: "Pick a channel first." });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const action = kind === "tickets" ? publishTicketPanel : publishFormsPanel;
      const res = await action(guildId, channelId);
      setMsg(
        res.ok
          ? {
              ok: true,
              text: res.updated
                ? "Panel updated in place. Check Discord!"
                : "Panel posted. Check Discord!",
            }
          : { ok: false, text: res.error },
      );
    });
  }

  const republishing = !!currentChannelId && channelId === currentChannelId;

  return (
    <div className="card space-y-4 border-blurple/30">
      <div>
        <div className="font-medium text-white">Post to Discord</div>
        <p className="mt-1 text-sm text-zinc-400">
          Save your changes above first, then publish the panel straight from
          here. No /command needed.
        </p>
      </div>
      <Select
        label="Channel"
        value={channelId}
        onChange={setChannelId}
        options={channels}
        prefix="#"
        placeholder="Pick where the panel goes"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={onPublish}
          disabled={pending}
        >
          {pending
            ? "Publishing…"
            : republishing
              ? "Update panel in Discord"
              : "Post panel to Discord"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-green-400" : "text-red-400"}>
            {msg.text}
          </span>
        )}
      </div>
      {currentChannelId && (
        <p className="text-xs text-zinc-500">
          A panel is already live in this server. Publishing to the same channel
          updates it; picking a different channel posts a new one there.
        </p>
      )}
    </div>
  );
}
