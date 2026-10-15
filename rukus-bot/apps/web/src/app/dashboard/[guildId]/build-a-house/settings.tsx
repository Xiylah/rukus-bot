"use client";

import { useState, useTransition } from "react";
import type { BuildAHouseConfig } from "@rukus/shared";
import { Select, type Option } from "@/components/Pickers";
import { saveLeaderboardSettings } from "./actions";

export function LeaderboardSettings({ guildId, initial, channels }: {
  guildId: string; initial: BuildAHouseConfig; channels: Option[];
}) {
  const [channel, setChannel] = useState(initial.submissionChannelId);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  return <div className="card space-y-5">
    <Select label="Stat-card submission channel" value={channel} onChange={setChannel}
      options={channels} prefix="#" placeholder="No channel selected" />
    <p className="text-sm text-zinc-400">Players open their stat card in-game and upload one PNG or JPEG here. Use a dedicated text channel. Leave this empty to disable submissions.</p>
    <button className="btn-primary" disabled={pending} onClick={() => {
      setStatus("");
      startTransition(async () => {
        try {
          const result = await saveLeaderboardSettings(guildId, { submissionChannelId: channel });
          setStatus(result.ok ? "Saved." : result.error ?? "Couldn't save.");
        } catch { setStatus("Couldn't save. Please try again."); }
      });
    }}>{pending ? "Saving…" : "Save changes"}</button>
    <p role="status" className="text-sm text-zinc-300">{status}</p>
  </div>;
}
