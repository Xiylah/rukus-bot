"use client";

import { useState, useTransition } from "react";
import { Select, type Option } from "@/components/Pickers";
import { publishSingleFormPanel } from "../actions";

/**
 * Post (or update) ONE form's own panel.
 *
 * Separate from the shared PublishPanel component because this targets a single
 * form: it remembers that form's own channel and message, so republishing edits
 * that message in place and never disturbs another form's panel.
 *
 * The action reads the SAVED config, not what is on screen, so the warning about
 * saving first is load-bearing: publishing before saving would post the old
 * wording and quietly confuse people.
 */
export function PublishFormPanel({
  guildId,
  formId,
  channels,
  currentChannelId,
}: {
  guildId: string;
  formId: string;
  channels: Option[];
  currentChannelId?: string;
}) {
  const [channelId, setChannelId] = useState<string | undefined>(currentChannelId);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const republishing = !!currentChannelId && channelId === currentChannelId;

  function onPublish() {
    if (!channelId) {
      setMsg({ ok: false, text: "Pick a channel first." });
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await publishSingleFormPanel(guildId, formId, channelId);
      setMsg(
        res.ok
          ? {
              ok: true,
              text: res.updated
                ? "Updated the existing panel in that channel."
                : "Posted the panel.",
            }
          : { ok: false, text: res.error },
      );
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-edge bg-panel/40 p-4">
      <div className="text-sm font-medium text-white">Post this form&apos;s panel</div>
      <p className="text-xs text-zinc-500">
        Save your changes first: this posts what is saved, not what is on screen.
      </p>
      <Select
        label="Channel"
        value={channelId}
        onChange={setChannelId}
        options={channels}
        prefix="#"
        placeholder="Pick where this panel goes"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={onPublish}
          disabled={pending}
        >
          {pending
            ? "Posting…"
            : republishing
              ? "Update the panel"
              : "Post to Discord"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-green-400" : "text-red-400"}>
            {msg.text}
          </span>
        )}
      </div>
      {currentChannelId && (
        <p className="text-xs text-zinc-500">
          This form&apos;s panel currently lives in{" "}
          <code className="rounded bg-panel px-1">
            #{channels.find((c) => c.id === currentChannelId)?.name ?? currentChannelId}
          </code>
          . Posting to a different channel creates a new panel there.
        </p>
      )}
    </div>
  );
}
