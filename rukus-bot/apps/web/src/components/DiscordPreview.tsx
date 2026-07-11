"use client";

/**
 * A Discord-style message mockup so admins can see what the bot will post
 * while they edit, without switching to Discord. Purely visual.
 */

export interface PreviewButton {
  emoji?: string;
  label: string;
}

export interface PreviewSelectOption {
  emoji?: string;
  label: string;
  description?: string;
}

export function DiscordPreview({
  botName = "Rukus",
  color = "#5865f2",
  title,
  description,
  buttons,
  select,
}: {
  botName?: string;
  color?: string;
  title: string;
  description: string;
  /** Rendered as Discord buttons under the embed. */
  buttons?: PreviewButton[];
  /** Rendered as an (opened) select menu under the embed. */
  select?: { placeholder: string; options: PreviewSelectOption[] };
}) {
  return (
    <div className="rounded-lg border border-edge bg-[#313338] p-4 font-sans">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blurple text-sm font-bold text-white">
          {botName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white">{botName}</span>
            <span className="rounded bg-blurple px-1 py-px text-[10px] font-semibold uppercase text-white">
              App
            </span>
            <span className="text-xs text-zinc-500">Today</span>
          </div>

          {/* Embed */}
          <div
            className="mt-1 max-w-md rounded border-l-4 bg-[#2b2d31] p-3"
            style={{ borderLeftColor: color }}
          >
            <div className="font-semibold text-white">
              {title || "Panel title"}
            </div>
            <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
              {description || "Panel description"}
            </div>
          </div>

          {/* Buttons */}
          {buttons && buttons.length > 0 && (
            <div className="mt-2 flex max-w-md flex-wrap gap-2">
              {buttons.map((b, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded bg-blurple px-3 py-1.5 text-sm font-medium text-white"
                >
                  {b.emoji && <span>{b.emoji}</span>}
                  {b.label || "Button"}
                </span>
              ))}
            </div>
          )}

          {/* Select menu (drawn open so all options are visible) */}
          {select && (
            <div className="mt-2 max-w-md">
              <div className="flex items-center justify-between rounded-t border border-[#1f2023] bg-[#1e1f22] px-3 py-2 text-sm text-zinc-400">
                <span>{select.placeholder || "Make a selection"}</span>
                <span>▴</span>
              </div>
              <div className="rounded-b border border-t-0 border-[#1f2023] bg-[#2b2d31]">
                {select.options.length === 0 && (
                  <div className="px-3 py-2 text-sm text-zinc-500">
                    Add ticket types to see them here.
                  </div>
                )}
                {select.options.map((o, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-[#35373c]"
                  >
                    {o.emoji && <span className="mt-px">{o.emoji}</span>}
                    <span className="min-w-0">
                      <span className="block font-medium text-zinc-100">
                        {o.label || "Option"}
                      </span>
                      {o.description && (
                        <span className="block truncate text-xs text-zinc-400">
                          {o.description}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
