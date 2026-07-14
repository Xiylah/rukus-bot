"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  /** Rendered before the label. Kept separate so search matches the words only. */
  icon?: string;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

/**
 * Sidebar navigation: grouped by category, filterable, current page highlighted.
 *
 * The filter box matters once the bot has twenty-odd modules - scanning a wall
 * of links to find "starboard" is exactly the friction that makes a dashboard
 * feel like a settings dump. On mobile the whole nav collapses behind one
 * button, because a phone has no room for a permanent sidebar.
 */
export function SideNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            (g.title ?? "").toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const current = groups
    .flatMap((g) => g.items)
    .find((i) => i.href === pathname);

  const list = (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search settings..."
        aria-label="Search settings"
        className="input"
      />

      {filtered.length === 0 && (
        <p className="px-3 text-sm text-zinc-500">Nothing matches "{query}".</p>
      )}

      {filtered.map((group, gi) => (
        <div key={group.title ?? `g${gi}`} className="flex flex-col gap-1">
          {group.title && (
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {group.title}
            </div>
          )}
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "flex items-center gap-2 rounded-md bg-blurple/15 px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-blurple/40"
                    : "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-card hover:text-white"
                }
              >
                {item.icon && (
                  <span aria-hidden className="w-5 flex-none text-center">
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* Mobile: one button that says where you are and opens the whole nav. */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="btn-ghost w-full justify-between"
        >
          <span className="truncate">
            {current ? `${current.icon ?? ""} ${current.label}`.trim() : "Menu"}
          </span>
          <span aria-hidden className="ml-2">
            {open ? "▲" : "▼"}
          </span>
        </button>
        {open && <div className="mt-3">{list}</div>}
      </div>

      <nav className="hidden md:block">{list}</nav>
    </>
  );
}
