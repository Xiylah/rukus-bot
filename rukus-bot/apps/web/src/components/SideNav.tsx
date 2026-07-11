"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavGroup {
  title?: string;
  items: { href: string; label: string }[];
}

/**
 * Sidebar navigation with the current page highlighted - small thing, but it
 * keeps non-technical staff oriented ("which settings am I editing?").
 */
export function SideNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-1">
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
                className={
                  active
                    ? "rounded-md bg-blurple/15 px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-blurple/40"
                    : "rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-card hover:text-white"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
