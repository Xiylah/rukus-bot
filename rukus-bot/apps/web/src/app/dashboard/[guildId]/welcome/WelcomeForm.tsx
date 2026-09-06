"use client";

import { useState, useTransition } from "react";
import type { WelcomeConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { saveWelcomeConfig } from "../actions";

/** Fill the {placeholders} with sample values so staff see a realistic message. */
function renderSample(text: string): string {
  return text
    .replace(/\{user\}/gi, "@NewMember")
    .replace(/\{username\}/gi, "NewMember")
    .replace(/\{server\}/gi, "Your Server")
    .replace(/\{memberCount\}/gi, "1234");
}

/**
 * A Discord message mockup for the welcome/leave preview.
 *
 * The bot posts these as plain message content, not an embed (see the bot's
 * guildMemberAdd), so this renders a bare message bubble rather than an embed
 * card, matching exactly what a member will see. Empty input shows a hint.
 */
function MessagePreview({ text }: { text: string }) {
  const rendered = renderSample(text);
  return (
    <div className="rounded-lg border border-edge bg-[#313338] p-4 font-sans">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blurple text-sm font-bold text-white">
          R
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white">Rukus</span>
            <span className="rounded bg-blurple px-1 py-px text-[10px] font-semibold uppercase text-white">
              App
            </span>
            <span className="text-xs text-zinc-500">Today</span>
          </div>
          <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
            {rendered || (
              <span className="text-zinc-600">Nothing to preview</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Preview of the EMBED form of the welcome, mirroring welcomeMessagePayload on
 * the bot: same title, description, thumbnail choice, image, footer and
 * timestamp, so what staff design here is what members get.
 */
function EmbedPreview({ config }: { config: WelcomeConfig }) {
  const hex = config.embedColor.replace(/^#/, "");
  const color = /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : "#5865f2";
  const ping = renderSample(config.embedPingContent);
  const title = renderSample(config.embedTitle);
  const desc = renderSample(config.message);
  const footer = renderSample(config.embedFooter);

  return (
    <div className="rounded-lg border border-edge bg-[#313338] p-4 font-sans">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blurple text-sm font-bold text-white">
          R
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white">Rukus</span>
            <span className="rounded bg-blurple px-1 py-px text-[10px] font-semibold uppercase text-white">
              App
            </span>
            <span className="text-xs text-zinc-500">Today</span>
          </div>

          {ping && (
            <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
              {ping}
            </div>
          )}

          <div
            className="mt-1 rounded border-l-4 bg-[#2b2d31] p-3"
            style={{ borderColor: color }}
          >
            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
                {title && (
                  <div className="font-semibold text-white">{title}</div>
                )}
                {desc && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
                    {desc}
                  </p>
                )}
              </div>
              {config.embedThumbnail !== "none" && (
                <div className="flex h-16 w-16 flex-none items-center justify-center rounded bg-blurple/30 text-[10px] text-zinc-300">
                  {config.embedThumbnail === "avatar" ? "avatar" : "icon"}
                </div>
              )}
            </div>

            {config.embedImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={config.embedImageUrl}
                alt=""
                className="mt-3 max-h-48 w-full rounded object-cover"
              />
            )}

            {(footer || config.embedTimestamp) && (
              <div className="mt-2 text-xs text-zinc-400">
                {footer}
                {footer && config.embedTimestamp ? " • " : ""}
                {config.embedTimestamp ? "Today at 5:27 AM" : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WelcomeForm({
  guildId,
  initial,
  channels,
  roles,
}: {
  guildId: string;
  initial: WelcomeConfig;
  channels: Option[];
  roles: Option[];
}) {
  const [config, setConfig] = useState<WelcomeConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof WelcomeConfig>(key: K, value: WelcomeConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveWelcomeConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="font-medium text-white">Welcome messages</div>
        <Toggle
          label="Enable welcome messages"
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <Select
          label="Welcome channel"
          value={config.channelId}
          onChange={(v) => set("channelId", v)}
          options={channels}
          prefix="#"
        />
        <div>
          <label className="label">Welcome message</label>
          <textarea
            className="input min-h-20"
            value={config.message}
            onChange={(e) => set("message", e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            {"{user}"} pings them, {"{username}"} is their name, {"{server}"} is
            the server name, {"{memberCount}"} is the new member total.
          </p>
          <div className="mt-2">
            {config.embedEnabled ? (
              <EmbedPreview config={config} />
            ) : (
              <MessagePreview text={config.message} />
            )}
          </div>
        </div>

        <Toggle
          label="Send as an embed"
          hint="Posts the welcome in a card with a coloured bar, the member avatar and a timestamp, instead of plain text. The message above becomes the card body."
          checked={config.embedEnabled}
          onChange={(v) => set("embedEnabled", v)}
        />

        {config.embedEnabled && (
          <div className="space-y-4 rounded-md border border-edge p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Title</label>
                <input
                  className="input"
                  maxLength={256}
                  value={config.embedTitle}
                  onChange={(e) => set("embedTitle", e.target.value)}
                />
              </div>
              <div>
                <label className="label">Colour</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 flex-none rounded border border-edge bg-panel"
                    value={`#${(config.embedColor || "5865F2").replace(/^#/, "")}`}
                    onChange={(e) =>
                      set("embedColor", e.target.value.replace(/^#/, ""))
                    }
                  />
                  <input
                    className="input"
                    maxLength={7}
                    value={config.embedColor}
                    onChange={(e) => set("embedColor", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="label">Small image (top right)</label>
              <select
                className="input"
                value={config.embedThumbnail}
                onChange={(e) =>
                  set(
                    "embedThumbnail",
                    e.target.value as WelcomeConfig["embedThumbnail"],
                  )
                }
              >
                <option value="avatar">The new member avatar</option>
                <option value="server">The server icon</option>
                <option value="none">Nothing</option>
              </select>
            </div>

            <div>
              <label className="label">Banner image URL (optional)</label>
              <input
                className="input"
                placeholder="https://..."
                value={config.embedImageUrl}
                onChange={(e) => set("embedImageUrl", e.target.value)}
              />
              <p className="mt-1 text-xs text-zinc-500">
                A wide image across the bottom of the card. Must be a direct
                link to an image file.
              </p>
            </div>

            <div>
              <label className="label">Footer (optional)</label>
              <input
                className="input"
                maxLength={2048}
                value={config.embedFooter}
                onChange={(e) => set("embedFooter", e.target.value)}
              />
            </div>

            <Toggle
              label="Show a timestamp"
              hint="Adds the join time under the card, like most welcome bots."
              checked={config.embedTimestamp}
              onChange={(v) => set("embedTimestamp", v)}
            />

            <div>
              <label className="label">Ping line above the card (optional)</label>
              <input
                className="input"
                maxLength={2000}
                placeholder="{user}"
                value={config.embedPingContent}
                onChange={(e) => set("embedPingContent", e.target.value)}
              />
              <p className="mt-1 text-xs text-zinc-500">
                A mention inside an embed shows but never notifies, so put
                {" "}{"{user}"} here if you want the new member actually pinged.
              </p>
            </div>
          </div>
        )}

        <Toggle
          label="Also send a welcome DM"
          hint="Sends the message below directly to the new member (skipped if their DMs are closed)."
          checked={config.dmEnabled}
          onChange={(v) => set("dmEnabled", v)}
        />
        {config.dmEnabled && (
          <div>
            <label className="label">DM message</label>
            <textarea
              className="input min-h-16"
              value={config.dmMessage}
              onChange={(e) => set("dmMessage", e.target.value)}
            />
            <div className="mt-2">
              <MessagePreview text={config.dmMessage} />
            </div>
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Auto-roles on join</div>
        <MultiSelect
          label="Roles given to every new member"
          hint="Applied the moment someone joins, even if welcome messages are off."
          values={config.joinRoleIds}
          onChange={(v) => set("joinRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="No auto-roles"
        />
      </div>

      <div className="card space-y-4">
        <div className="font-medium text-white">Leave messages</div>
        <Toggle
          label="Enable leave messages"
          checked={config.leaveEnabled}
          onChange={(v) => set("leaveEnabled", v)}
        />
        <Select
          label="Leave channel"
          value={config.leaveChannelId}
          onChange={(v) => set("leaveChannelId", v)}
          options={channels}
          prefix="#"
        />
        <div>
          <label className="label">Leave message</label>
          <textarea
            className="input min-h-16"
            value={config.leaveMessage}
            onChange={(e) => set("leaveMessage", e.target.value)}
          />
          <div className="mt-2">
            <MessagePreview text={config.leaveMessage} />
          </div>
        </div>
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
