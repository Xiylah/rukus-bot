"use client";

import { useState, useTransition } from "react";
import type {
  SocialAlertsConfig,
  SocialFeed,
  SocialFeedType,
} from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, type Option } from "@/components/Pickers";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveSocialAlertsConfig } from "./actions";

function shortId() {
  return `f_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyFeed(): SocialFeed {
  return {
    id: shortId(),
    enabled: true,
    type: "youtube",
    source: "",
    displayName: "New feed",
    postChannelId: undefined,
    message: "{everyone} **{name}** posted a new video!\n{link}",
    mentionRoleId: undefined,
    liveRoleId: undefined,
    embedColor: "#5865f2",
    lastItemId: "",
  };
}

const TYPES: { value: SocialFeedType; label: string }[] = [
  { value: "youtube", label: "📺 YouTube" },
  { value: "twitch", label: "🟣 Twitch" },
  { value: "rss", label: "📰 RSS / Atom" },
];

const SOURCE_HELP: Record<SocialFeedType, { label: string; hint: string; placeholder: string }> = {
  youtube: {
    label: "YouTube channel",
    hint: "Paste the channel URL (youtube.com/@somebody or /channel/UC...). The raw channel ID works too. No API key needed.",
    placeholder: "https://www.youtube.com/@somebody",
  },
  twitch: {
    label: "Twitch username",
    hint: "Just the login name, e.g. 'somebody' from twitch.tv/somebody. The full URL is fine as well. Needs Twitch credentials on the bot.",
    placeholder: "somebody",
  },
  rss: {
    label: "Feed URL",
    hint: "The full URL of an RSS or Atom feed. Most blogs and news sites publish one at /feed or /rss.",
    placeholder: "https://example.com/blog/feed.xml",
  },
};

/** Default message per type, applied when the user switches type on a fresh feed. */
const DEFAULT_MESSAGE: Record<SocialFeedType, string> = {
  youtube: "{everyone} **{name}** posted a new video!\n{link}",
  twitch: "{everyone} **{name}** is live now!\n{link}",
  rss: "**{name}**: {title}\n{link}",
};

/** Substitute the placeholders for the preview, so admins see the real shape. */
function previewText(
  message: string,
  feed: SocialFeed,
  roleName: string | undefined,
): string {
  return message
    .replace(/\{name\}/gi, feed.displayName || "Creator")
    .replace(/\{title\}/gi, "An example item title")
    .replace(/\{link\}/gi, "https://example.com/the-new-item")
    .replace(/\{everyone\}/gi, "@everyone")
    .replace(/\{here\}/gi, "@here")
    .replace(/\{role\}/gi, roleName ? `@${roleName}` : "");
}

export function SocialAlertsForm({
  guildId,
  initial,
  channels,
  roles,
  grantableRoles,
}: {
  guildId: string;
  initial: SocialAlertsConfig;
  channels: Option[];
  roles: Option[];
  grantableRoles: Option[];
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [feeds, setFeeds] = useState<SocialFeed[]>(initial.feeds);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initial.feeds[0]?.id,
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fi = feeds.findIndex((f) => f.id === selectedId);
  const feed = fi >= 0 ? feeds[fi] : undefined;

  function update(patch: Partial<SocialFeed>) {
    setFeeds((fs) => fs.map((f, i) => (i === fi ? { ...f, ...patch } : f)));
  }

  /**
   * Switching type rewrites the default message, but only when the current one
   * is still another type's untouched default. Someone who wrote their own
   * announcement must never lose it to a dropdown change.
   */
  function changeType(type: SocialFeedType) {
    const isUntouched = Object.values(DEFAULT_MESSAGE).includes(
      feed?.message ?? "",
    );
    update({
      type,
      ...(isUntouched ? { message: DEFAULT_MESSAGE[type] } : {}),
      // The live role is a Twitch-only concept; drop it when leaving Twitch so a
      // stale role id cannot linger in the saved config.
      ...(type === "twitch" ? {} : { liveRoleId: undefined }),
    });
  }

  function addFeed() {
    const f = emptyFeed();
    setFeeds((fs) => [...fs, f]);
    setSelectedId(f.id);
  }

  function removeFeed() {
    setFeeds((fs) => {
      const next = fs.filter((f) => f.id !== selectedId);
      setSelectedId(next[0]?.id);
      return next;
    });
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveSocialAlertsConfig(guildId, { enabled, feeds });
      setMsg(
        res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error },
      );
    });
  }

  const mentionRoleName = feed?.mentionRoleId
    ? roles.find((r) => r.id === feed.mentionRoleId)?.name
    : undefined;
  const help = feed ? SOURCE_HELP[feed.type] : null;

  return (
    <div className="space-y-5">
      <div className="card">
        <Toggle
          label="Enable social alerts"
          hint="Master switch. Individual feeds can also be turned on and off."
          checked={enabled}
          onChange={setEnabled}
        />
      </div>

      {/* Feed selector */}
      <div className="card">
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || undefined)}
          >
            {feeds.length === 0 && (
              <option value="">No feeds yet, add one →</option>
            )}
            {feeds.map((f, i) => (
              <option key={f.id} value={f.id}>
                {i + 1} | {f.enabled ? "" : "(off) "}
                {TYPES.find((t) => t.value === f.type)?.label ?? f.type}{" "}
                {f.displayName}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary whitespace-nowrap"
            onClick={addFeed}
            disabled={feeds.length >= 25}
          >
            + New feed
          </button>
        </div>
      </div>

      {feed && fi >= 0 && help && (
        <>
          {/* What to watch */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Editing feed {fi + 1} of {feeds.length}
              </span>
              <button
                type="button"
                className="text-sm text-red-400 hover:underline"
                onClick={removeFeed}
              >
                Delete this feed
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Type</label>
                <select
                  className="input"
                  value={feed.type}
                  onChange={(e) => changeType(e.target.value as SocialFeedType)}
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Toggle
                  label="Feed enabled"
                  checked={feed.enabled}
                  onChange={(v) => update({ enabled: v })}
                />
              </div>
            </div>

            <div>
              <label className="label">{help.label}</label>
              <input
                className="input"
                maxLength={300}
                placeholder={help.placeholder}
                value={feed.source}
                onChange={(e) => update({ source: e.target.value })}
              />
              <p className="mt-1 text-xs text-zinc-500">{help.hint}</p>
            </div>

            <div>
              <label className="label">Display name</label>
              <input
                className="input"
                maxLength={80}
                placeholder="Somebody"
                value={feed.displayName}
                onChange={(e) => update({ displayName: e.target.value })}
              />
              <p className="mt-1 text-xs text-zinc-500">
                What {"{name}"} becomes in the message, and how this feed is
                labelled here.
              </p>
            </div>

            <Select
              label="Post announcements in"
              value={feed.postChannelId}
              onChange={(v) => update({ postChannelId: v })}
              options={channels}
              prefix="#"
              placeholder="Pick a channel"
            />
          </div>

          {/* The announcement */}
          <div className="card space-y-4">
            <div className="font-medium text-white">The announcement</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className="label">Message</label>
                  <textarea
                    className="input min-h-24"
                    maxLength={2000}
                    value={feed.message}
                    onChange={(e) => update({ message: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    {"{name}"} the creator, {"{title}"} the item title,{" "}
                    {"{link}"} the URL, {"{role}"} pings the mention role below.{" "}
                    {"{everyone}"} and {"{here}"} ping the server. The bot only
                    allows a ping that this message actually asks for, so a feed
                    can never mass-ping by accident.
                  </p>
                </div>

                <Select
                  label="Ping this role"
                  hint="What {role} becomes. Leave empty for no role ping."
                  value={feed.mentionRoleId}
                  onChange={(v) => update({ mentionRoleId: v })}
                  options={roles}
                  prefix="@"
                  placeholder="No role"
                />

                {feed.type === "twitch" && (
                  <Select
                    label="Live role (Twitch only)"
                    hint="Given to the streamer's member while they are live, taken back when they go offline. Matched by their server nickname or username."
                    value={feed.liveRoleId}
                    onChange={(v) => update({ liveRoleId: v })}
                    options={grantableRoles}
                    prefix="@"
                    placeholder="No live role"
                  />
                )}

                <div>
                  <label className="label">Embed color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-12 cursor-pointer rounded border border-edge bg-panel"
                      value={feed.embedColor}
                      onChange={(e) => update({ embedColor: e.target.value })}
                    />
                    <span className="text-sm text-zinc-400">
                      {feed.embedColor}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Preview</label>
                <div className="mb-2 whitespace-pre-wrap rounded-lg border border-edge bg-[#313338] p-3 text-sm text-zinc-200">
                  {previewText(feed.message, feed, mentionRoleName) ||
                    "(no message)"}
                </div>
                <DiscordPreview
                  color={feed.embedColor}
                  title="An example item title"
                  description={
                    feed.type === "twitch"
                      ? "Playing Some Game"
                      : "The bot adds the title, link, and thumbnail automatically."
                  }
                />
              </div>
            </div>
          </div>
        </>
      )}

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
