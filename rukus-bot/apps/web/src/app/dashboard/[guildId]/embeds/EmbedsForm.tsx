"use client";

import { useState, useTransition } from "react";
import type { EmbedsConfig, SavedEmbed } from "@rukus/shared";
import { Select, type Option } from "@/components/Pickers";
import { Toggle } from "@/components/Toggle";
import { saveEmbedsConfig, publishEmbed, unlinkEmbed } from "./actions";

/** Short client-side id for new embeds and fields. */
function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function blankEmbed(): SavedEmbed {
  return {
    id: newId(),
    name: "New embed",
    channelId: undefined,
    messageId: undefined,
    content: "",
    title: "",
    titleUrl: "",
    description: "",
    color: "5865F2",
    authorName: "",
    authorIconUrl: "",
    imageUrl: "",
    thumbnailUrl: "",
    footerText: "",
    footerIconUrl: "",
    timestamp: false,
    fields: [],
  };
}

/**
 * Live preview of what Discord will render.
 *
 * Worth the code: an embed is the one thing staff build blind, and the cost of
 * getting it wrong is a bad post in a public channel that everyone sees before
 * it can be fixed.
 */
function Preview({ embed }: { embed: SavedEmbed }) {
  const color = /^#?[0-9a-fA-F]{6}$/.test(embed.color)
    ? `#${embed.color.replace(/^#/, "")}`
    : "#5865f2";

  const empty =
    !embed.title &&
    !embed.description &&
    !embed.imageUrl &&
    !embed.authorName &&
    embed.fields.length === 0;

  return (
    <div className="rounded-lg border border-edge bg-[#313338] p-4 font-sans">
      {embed.content && (
        <p className="mb-2 whitespace-pre-wrap text-sm text-zinc-200">
          {embed.content}
        </p>
      )}
      {!empty && (
        <div
          className="rounded border-l-4 bg-[#2b2d31] p-3"
          style={{ borderColor: color }}
        >
          {embed.authorName && (
            <div className="mb-1 flex items-center gap-2">
              {embed.authorIconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={embed.authorIconUrl}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              )}
              <span className="text-sm font-semibold text-white">
                {embed.authorName}
              </span>
            </div>
          )}
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              {embed.title && (
                <div
                  className={`font-semibold ${embed.titleUrl ? "text-[#00a8fc]" : "text-white"}`}
                >
                  {embed.title}
                </div>
              )}
              {embed.description && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
                  {embed.description}
                </p>
              )}
              {embed.fields.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-3">
                  {embed.fields.map((f) => (
                    <div
                      key={f.name + f.value}
                      className={f.inline ? "min-w-[30%] flex-1" : "w-full"}
                    >
                      <div className="text-xs font-semibold text-white">
                        {f.name}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-zinc-300">
                        {f.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {embed.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={embed.thumbnailUrl}
                alt=""
                className="h-20 w-20 flex-none rounded object-cover"
              />
            )}
          </div>
          {embed.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={embed.imageUrl}
              alt=""
              className="mt-3 max-h-64 w-full rounded object-cover"
            />
          )}
          {(embed.footerText || embed.timestamp) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
              {embed.footerIconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={embed.footerIconUrl}
                  alt=""
                  className="h-4 w-4 rounded-full object-cover"
                />
              )}
              <span>
                {embed.footerText}
                {embed.footerText && embed.timestamp ? " • " : ""}
                {embed.timestamp ? "Today at 12:00 PM" : ""}
              </span>
            </div>
          )}
        </div>
      )}
      {empty && !embed.content && (
        <p className="text-sm italic text-zinc-500">
          Nothing to show yet. Add a title, description, image or message text.
        </p>
      )}
    </div>
  );
}

export function EmbedsForm({
  guildId,
  initial,
  channels,
}: {
  guildId: string;
  initial: EmbedsConfig;
  channels: Option[];
}) {
  const [embeds, setEmbeds] = useState<SavedEmbed[]>(initial.embeds);
  const [openId, setOpenId] = useState<string | null>(
    initial.embeds[0]?.id ?? null,
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function patch(id: string, changes: Partial<SavedEmbed>) {
    setEmbeds((list) =>
      list.map((e) => (e.id === id ? { ...e, ...changes } : e)),
    );
  }

  function onSave(then?: () => void) {
    setMsg(null);
    startTransition(async () => {
      const res = await saveEmbedsConfig(guildId, { embeds });
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setMsg({ ok: true, text: "Saved." });
      then?.();
    });
  }

  /**
   * Publishing always saves first. Staff edit and hit "post" expecting what
   * they see to go out; without this the button would silently publish the
   * previously-saved version, which reads as the button being broken.
   */
  function onPublish(id: string) {
    setMsg(null);
    startTransition(async () => {
      const saved = await saveEmbedsConfig(guildId, { embeds });
      if (!saved.ok) {
        setMsg({ ok: false, text: saved.error });
        return;
      }
      const res = await publishEmbed(guildId, id);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      if (res.messageId) patch(id, { messageId: res.messageId });
      setMsg({
        ok: true,
        text: res.updated
          ? "Updated the existing message in Discord."
          : "Posted to Discord.",
      });
    });
  }

  function onUnlink(id: string) {
    startTransition(async () => {
      await unlinkEmbed(guildId, id);
      patch(id, { messageId: undefined });
      setMsg({
        ok: true,
        text: "Unlinked. The message stays in Discord; the next post creates a new one.",
      });
    });
  }

  return (
    <div className="space-y-5">
      {embeds.length === 0 && (
        <div className="card text-sm text-zinc-400">
          No embeds yet. Create one to post a rules, info or announcement
          message that you can edit later without losing its reactions.
        </div>
      )}

      {embeds.map((embed) => {
        const open = openId === embed.id;
        return (
          <div key={embed.id} className="card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left"
                onClick={() => setOpenId(open ? null : embed.id)}
              >
                <span aria-hidden className="text-zinc-500">
                  {open ? "▾" : "▸"}
                </span>
                <span className="truncate font-medium text-white">
                  {embed.name || "Untitled embed"}
                </span>
                {embed.messageId && (
                  <span className="flex-none rounded bg-green-500/15 px-1.5 py-0.5 text-[11px] text-green-400">
                    live
                  </span>
                )}
              </button>
              <button
                type="button"
                className="btn-ghost flex-none text-red-400"
                onClick={() => {
                  setEmbeds((l) => l.filter((e) => e.id !== embed.id));
                  setMsg({
                    ok: true,
                    text: "Removed. Click Save to confirm.",
                  });
                }}
              >
                Delete
              </button>
            </div>

            {open && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Name (dashboard only)</label>
                    <input
                      className="input"
                      value={embed.name}
                      maxLength={100}
                      onChange={(e) => patch(embed.id, { name: e.target.value })}
                    />
                  </div>
                  <Select
                    label="Channel"
                    value={embed.channelId}
                    onChange={(v) => patch(embed.id, { channelId: v })}
                    options={channels}
                    prefix="#"
                    placeholder="Where it posts"
                  />
                </div>

                <div>
                  <label className="label">Message text (above the embed)</label>
                  <textarea
                    className="input min-h-16"
                    maxLength={2000}
                    value={embed.content}
                    onChange={(e) => patch(embed.id, { content: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Optional. Leave everything else blank to send a plain
                    message with no embed.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Title</label>
                    <input
                      className="input"
                      maxLength={256}
                      value={embed.title}
                      onChange={(e) => patch(embed.id, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Title link</label>
                    <input
                      className="input"
                      placeholder="https://..."
                      value={embed.titleUrl}
                      onChange={(e) =>
                        patch(embed.id, { titleUrl: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Description</label>
                  <textarea
                    className="input min-h-32"
                    maxLength={4000}
                    value={embed.description}
                    onChange={(e) =>
                      patch(embed.id, { description: e.target.value })
                    }
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Markdown works: **bold**, *italic*, `code`, and links. Press
                    Enter for a real line break.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Colour (hex)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="h-9 w-12 flex-none rounded border border-edge bg-panel"
                        value={`#${(embed.color || "5865F2").replace(/^#/, "")}`}
                        onChange={(e) =>
                          patch(embed.id, {
                            color: e.target.value.replace(/^#/, ""),
                          })
                        }
                      />
                      <input
                        className="input"
                        placeholder="5865F2"
                        maxLength={7}
                        value={embed.color}
                        onChange={(e) =>
                          patch(embed.id, { color: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Thumbnail URL (small, right)</label>
                    <input
                      className="input"
                      placeholder="https://..."
                      value={embed.thumbnailUrl}
                      onChange={(e) =>
                        patch(embed.id, { thumbnailUrl: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Image URL (large, bottom)</label>
                  <input
                    className="input"
                    placeholder="https://..."
                    value={embed.imageUrl}
                    onChange={(e) =>
                      patch(embed.id, { imageUrl: e.target.value })
                    }
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Author name (top line)</label>
                    <input
                      className="input"
                      maxLength={256}
                      value={embed.authorName}
                      onChange={(e) =>
                        patch(embed.id, { authorName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Author icon URL</label>
                    <input
                      className="input"
                      placeholder="https://..."
                      value={embed.authorIconUrl}
                      onChange={(e) =>
                        patch(embed.id, { authorIconUrl: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Footer text</label>
                    <input
                      className="input"
                      maxLength={2048}
                      value={embed.footerText}
                      onChange={(e) =>
                        patch(embed.id, { footerText: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Footer icon URL</label>
                    <input
                      className="input"
                      placeholder="https://..."
                      value={embed.footerIconUrl}
                      onChange={(e) =>
                        patch(embed.id, { footerIconUrl: e.target.value })
                      }
                    />
                  </div>
                </div>

                <Toggle
                  label="Show a timestamp"
                  hint="Stamps the footer with the time it was last posted or updated."
                  checked={embed.timestamp}
                  onChange={(v) => patch(embed.id, { timestamp: v })}
                />

                {/* ---- Fields ---- */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="label mb-0">
                      Fields ({embed.fields.length}/25)
                    </label>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={embed.fields.length >= 25}
                      onClick={() =>
                        patch(embed.id, {
                          fields: [
                            ...embed.fields,
                            { name: "Field", value: "Value", inline: false },
                          ],
                        })
                      }
                    >
                      + Add field
                    </button>
                  </div>
                  {embed.fields.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-edge p-3 space-y-2"
                    >
                      <div className="flex gap-2">
                        <input
                          className="input"
                          placeholder="Field name"
                          maxLength={256}
                          value={f.name}
                          onChange={(e) => {
                            const fields = [...embed.fields];
                            fields[i] = { ...f, name: e.target.value };
                            patch(embed.id, { fields });
                          }}
                        />
                        <button
                          type="button"
                          className="btn-ghost flex-none text-red-400"
                          onClick={() =>
                            patch(embed.id, {
                              fields: embed.fields.filter((_, j) => j !== i),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        className="input min-h-16"
                        placeholder="Field value"
                        maxLength={1024}
                        value={f.value}
                        onChange={(e) => {
                          const fields = [...embed.fields];
                          fields[i] = { ...f, value: e.target.value };
                          patch(embed.id, { fields });
                        }}
                      />
                      <Toggle
                        label="Show side by side"
                        checked={f.inline}
                        onChange={(v) => {
                          const fields = [...embed.fields];
                          fields[i] = { ...f, inline: v };
                          patch(embed.id, { fields });
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="label">Preview</label>
                  <Preview embed={embed} />
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={pending}
                    onClick={() => onPublish(embed.id)}
                  >
                    {pending
                      ? "Working…"
                      : embed.messageId
                        ? "Update the live message"
                        : "Post to Discord"}
                  </button>
                  {embed.messageId && (
                    <>
                      <a
                        className="btn-ghost"
                        href={`https://discord.com/channels/${guildId}/${embed.channelId}/${embed.messageId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View in Discord
                      </a>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={pending}
                        onClick={() => onUnlink(embed.id)}
                      >
                        Unlink
                      </button>
                    </>
                  )}
                </div>

                {embed.messageId && (
                  <p className="text-xs text-zinc-500">
                    This embed is live. Updating edits the original message, so
                    its reactions, pin and links all survive. Unlink forgets it
                    without deleting anything, so the next post creates a new
                    message.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          disabled={embeds.length >= 50}
          onClick={() => {
            const e = blankEmbed();
            setEmbeds((l) => [...l, e]);
            setOpenId(e.id);
          }}
        >
          + New embed
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() => onSave()}
        >
          {pending ? "Saving…" : "Save"}
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
