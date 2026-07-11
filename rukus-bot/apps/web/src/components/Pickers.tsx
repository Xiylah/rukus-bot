"use client";

import { useState, useRef, useEffect } from "react";

/**
 * Dropdown pickers for Discord channels, categories, and roles.
 *
 * These replace the old "paste a snowflake ID" inputs — the guild's real
 * channels/roles are fetched server-side (see lib/discord.ts) and passed in as
 * `options`, so non-technical staff pick from a list instead of hunting for IDs
 * with Developer Mode.
 *
 * The stored value is still the Discord ID; only the input surface changed.
 */

export interface Option {
  id: string;
  name: string;
  /** Optional hex color (roles). */
  color?: string;
}

/** Convert Discord's integer role color to CSS, ignoring the "no color" 0. */
export function roleColor(color: number): string | undefined {
  if (!color) return undefined;
  return `#${color.toString(16).padStart(6, "0")}`;
}

// ---------------- Single select ----------------

export function Select({
  label,
  hint,
  value,
  onChange,
  options,
  placeholder = "— none —",
  prefix = "",
}: {
  label: string;
  hint?: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: Option[];
  placeholder?: string;
  /** Rendered before each name, e.g. "#" for channels or "@" for roles. */
  prefix?: string;
}) {
  // A value pointing at a deleted channel/role would otherwise vanish silently.
  const missing = value && !options.some((o) => o.id === value);

  return (
    <div>
      <label className="label">{label}</label>
      <select
        className="input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">{placeholder}</option>
        {missing && (
          <option value={value}>⚠ unknown ({value}) — no longer exists</option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {prefix}
            {o.name}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      {options.length === 0 && (
        <p className="mt-1 text-xs text-amber-400">
          Nothing to choose from — is the bot in this server with permission to
          view it?
        </p>
      )}
    </div>
  );
}

// ---------------- Multi select (checkbox dropdown) ----------------

export function MultiSelect({
  label,
  hint,
  values,
  onChange,
  options,
  prefix = "",
  emptyText = "None selected",
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: Option[];
  prefix?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside the dropdown.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function toggle(id: string) {
    onChange(
      values.includes(id) ? values.filter((v) => v !== id) : [...values, id],
    );
  }

  const selected = options.filter((o) => values.includes(o.id));
  // Ids that no longer match a real role/channel (deleted since being saved).
  const orphans = values.filter((v) => !options.some((o) => o.id === v));

  return (
    <div ref={ref} className="relative">
      <label className="label">{label}</label>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex min-h-10 flex-wrap items-center gap-1.5 text-left"
      >
        {selected.length === 0 && orphans.length === 0 ? (
          <span className="text-zinc-500">{emptyText}</span>
        ) : (
          <>
            {selected.map((o) => (
              <span
                key={o.id}
                className="rounded bg-edge px-1.5 py-0.5 text-xs"
                style={o.color ? { color: o.color } : undefined}
              >
                {prefix}
                {o.name}
              </span>
            ))}
            {orphans.map((id) => (
              <span
                key={id}
                className="rounded bg-edge px-1.5 py-0.5 text-xs text-amber-400"
                title="This no longer exists in the server"
              >
                ⚠ {id}
              </span>
            ))}
          </>
        )}
        <span className="ml-auto text-zinc-500">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-edge bg-card p-1 shadow-xl">
          {options.length === 0 && (
            <div className="px-2 py-2 text-sm text-zinc-500">
              Nothing available.
            </div>
          )}
          {options.map((o) => {
            const on = values.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-edge"
              >
                <input type="checkbox" checked={on} readOnly className="pointer-events-none" />
                <span style={o.color ? { color: o.color } : undefined}>
                  {prefix}
                  {o.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
