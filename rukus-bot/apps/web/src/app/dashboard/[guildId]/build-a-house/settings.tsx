"use client";

import { useState, useTransition } from "react";
import type { BuildAHouseConfig } from "@rukus/shared";
import { Select, type Option } from "@/components/Pickers";
import { publishSubmissionPanel, saveLeaderboardSettings, refreshLeaderboardNow, resetEveryoneSubmissionLimit, replaceMyLinkedCard } from "./actions";

export function LeaderboardSettings({ guildId, initial, channels }: {
  guildId: string; initial: BuildAHouseConfig; channels: Option[];
}) {
  const [channel, setChannel] = useState(initial.submissionChannelId);
  const [leaderboardChannel, setLeaderboardChannel] = useState(initial.leaderboardChannelId);
  const [savedChannel, setSavedChannel] = useState(initial.submissionChannelId);
  const [savedLeaderboardChannel, setSavedLeaderboardChannel] = useState(initial.leaderboardChannelId);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  return <div className="card space-y-5">
    <Select label="Stat-card submission channel" value={channel} onChange={setChannel}
      options={channels} prefix="#" placeholder="No channel selected" />
    <p className="text-sm text-zinc-400">Players open their stat card in-game and upload one PNG or JPEG here. Use a dedicated text channel. Leave this empty to disable submissions.</p>
    <Select label="Weekly top-10 leaderboard channel" value={leaderboardChannel} onChange={setLeaderboardChannel}
      options={channels} prefix="#" placeholder="No channel selected" />
    <p className="text-sm text-zinc-400">Choose a separate channel. The bot posts four top-10 embeds within a minute of saving, then refreshes the same message every Sunday at midnight America/Chicago. Rankings use the latest submitted stats; player totals do not reset. Leave empty to pause updates.</p>
    <button className="btn-primary" disabled={pending} onClick={() => {
      setStatus("");
      startTransition(async () => {
        try {
          const result = await saveLeaderboardSettings(guildId, { submissionChannelId: channel, leaderboardChannelId: leaderboardChannel });
          if (result.ok) { setSavedChannel(channel); setSavedLeaderboardChannel(leaderboardChannel); }
          setStatus(result.ok ? "Saved." : result.error ?? "Couldn't save.");
        } catch { setStatus("Couldn't save. Please try again."); }
      });
    }}>{pending ? "Saving…" : "Save changes"}</button>
    <button className="btn-primary" disabled={pending || !channel || channel !== savedChannel} onClick={() => {
      startTransition(async () => {
        try {
          const result = await publishSubmissionPanel(guildId);
          setStatus(result.ok ? "Submission panel published." : result.error ?? "Couldn't publish.");
        } catch { setStatus("Couldn't publish. Please try again."); }
      });
    }}>Publish submission panel</button>
    <p className="text-sm text-zinc-400">Save the submission channel first, then publish. The green Submit Stat Card button opens a private screenshot upload form.</p>
    <button className="btn-primary" disabled={pending || !leaderboardChannel || leaderboardChannel !== savedLeaderboardChannel} onClick={() => {
      setStatus("");
      startTransition(async () => {
        try {
          const result = await refreshLeaderboardNow(guildId);
          setStatus(result.ok ? "Refresh queued. The bot will update the leaderboard within a minute while online." : result.error ?? "Couldn't request a refresh.");
        } catch { setStatus("Couldn't request a refresh. Please try again."); }
      });
    }}>Refresh leaderboard now</button>
    <p className="text-sm text-zinc-400">Save the leaderboard channel first. Refresh all four top-10 embeds using players’ latest submitted cards, without waiting for Sunday. This does not change their 24-hour submission limit.</p>
    <button className="btn-primary" disabled={pending} onClick={() => {
      setStatus("");
      startTransition(async () => {
        try {
          const result = await resetEveryoneSubmissionLimit(guildId);
          setStatus(result.ok ? "Submission limits reset for everyone. Players can submit a fresh card now; their next successful submission starts a new 24-hour limit." : result.error ?? "Couldn't reset limits.");
        } catch { setStatus("Couldn't reset submission limits. Please try again."); }
      });
    }}>Reset submission limits for everyone</button>
    <p className="text-sm text-zinc-400">Testing control: clears everyone’s current 24-hour wait. Saved leaderboard stats and account links stay intact. Each player must capture a fresh card; their next successful update starts the normal 24-hour limit again.</p>
    <button className="btn-primary" disabled={pending} onClick={() => {
      setStatus("");
      startTransition(async () => {
        try {
          const result = await replaceMyLinkedCard(guildId);
          setStatus(result.ok ? "Card replacement allowed for your signed-in Discord account for 15 minutes. Capture a fresh card from your correct Fortnite save and submit it with that same Discord account." : result.error ?? "Couldn't allow replacement.");
        } catch { setStatus("Couldn't allow card replacement. Please try again."); }
      });
    }}>Replace my linked card</button>
    <p className="text-sm text-zinc-400">Use when your Discord account was linked to a blank playtest save. Allows one different card within 15 minutes, including a new playtime baseline. Your current stats stay until the replacement succeeds. The replacement starts a new 24-hour submission limit.</p>
    <p role="status" className="text-sm text-zinc-300">{status}</p>
  </div>;
}
