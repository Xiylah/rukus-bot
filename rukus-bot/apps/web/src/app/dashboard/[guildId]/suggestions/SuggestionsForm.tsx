"use client";

import { useState, useTransition } from "react";
import type { SuggestionsConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, type Option } from "@/components/Pickers";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveSuggestionsConfig } from "../actions";

export function SuggestionsForm({
  guildId,
  initial,
  channels,
}: {
  guildId: string;
  initial: SuggestionsConfig;
  channels: Option[];
}) {
  const [config, setConfig] = useState<SuggestionsConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof SuggestionsConfig>(
    key: K,
    value: SuggestionsConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveSuggestionsConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">Where suggestions go</div>
        <Toggle
          label="Enable suggestions"
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <Select
          label="Suggestions channel"
          hint="Where /suggest posts, and where people vote."
          value={config.channelId}
          onChange={(v) => set("channelId", v)}
          options={channels}
          prefix="#"
        />
        <Select
          label="Decision channel"
          hint="Optional. Approvals and denials get announced here too, so the voting channel stays a feed of open ideas."
          value={config.decisionChannelId}
          onChange={(v) => set("decisionChannelId", v)}
          options={channels}
          prefix="#"
          placeholder="Decide in place"
        />
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">How they behave</div>
        <Toggle
          label="Anonymous suggestions"
          hint="Hides the author on the public card. Staff can still see who submitted it in the database, so abuse is still actionable."
          checked={config.anonymous}
          onChange={(v) => set("anonymous", v)}
        />
        <Toggle
          label="Add vote reactions"
          checked={config.allowVoting}
          onChange={(v) => set("allowVoting", v)}
        />
        {config.allowVoting && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Upvote emoji</label>
              <input
                className="input"
                value={config.upvoteEmoji}
                onChange={(e) => set("upvoteEmoji", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Downvote emoji</label>
              <input
                className="input"
                value={config.downvoteEmoji}
                onChange={(e) => set("downvoteEmoji", e.target.value)}
              />
            </div>
          </div>
        )}
        <Toggle
          label="Open a thread on each suggestion"
          hint="Keeps discussion out of the main feed, so the channel stays scannable."
          checked={config.threadPerSuggestion}
          onChange={(v) => set("threadPerSuggestion", v)}
        />
      </div>

      <div className="card space-y-3">
        <div className="font-medium text-white">Preview</div>
        <p className="text-xs text-zinc-500">
          How a new suggestion card looks when it is posted.
          {config.allowVoting &&
            ` Members vote with the ${config.upvoteEmoji || "👍"} and ${config.downvoteEmoji || "👎"} reactions.`}
        </p>
        <DiscordPreview
          title="💡 Suggestion #42"
          description={
            "Add a dark theme to the member dashboard.\n\nStatus: Open" +
            (config.anonymous ? "\nSubmitted anonymously" : "\nby @Ada")
          }
        />
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-green-400" : "text-red-400"}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
