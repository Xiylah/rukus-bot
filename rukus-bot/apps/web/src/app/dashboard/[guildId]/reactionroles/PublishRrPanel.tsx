"use client";

import { useState, useTransition } from "react";
import { publishReactionRolePanel } from "./actions";

/**
 * "Post to Discord" card for one panel, following components/PublishPanel.tsx.
 *
 * It saves first, always. A panel's buttons carry its id and its roles in their
 * custom ids, so publishing an unsaved panel would post buttons the bot cannot
 * resolve - the one thing that makes this feature look broken.
 */
export function PublishRrPanel({
  guildId,
  panelId,
  channelId,
  posted,
  save,
}: {
  guildId: string;
  panelId: string;
  /** Where this panel is set to go. Empty means the admin hasn't picked one. */
  channelId: string | undefined;
  /** True when a live message already exists, so publishing edits it. */
  posted: boolean;
  /** Persists the whole form. Returns false when validation failed. */
  save: () => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onPublish() {
    if (!channelId) {
      setMsg({ ok: false, text: "Pick a channel for this panel first." });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const saved = await save();
      if (!saved) {
        setMsg({ ok: false, text: "Fix the errors above, then publish." });
        return;
      }
      const res = await publishReactionRolePanel(guildId, panelId);
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

  return (
    <div className="card space-y-4 border-blurple/30">
      <div>
        <div className="font-medium text-white">Post to Discord</div>
        <p className="mt-1 text-sm text-zinc-400">
          Saves this panel and publishes it to{" "}
          {channelId ? <>its channel</> : <>the channel you pick above</>}. No
          /command needed.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={onPublish}
          disabled={pending}
        >
          {pending
            ? "Publishing…"
            : posted
              ? "Save and update panel in Discord"
              : "Save and post panel to Discord"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-green-400" : "text-red-400"}>
            {msg.text}
          </span>
        )}
      </div>
      {posted && (
        <p className="text-xs text-zinc-500">
          This panel is already live. Publishing edits that same message, so
          members keep the roles they already picked.
        </p>
      )}
    </div>
  );
}
