"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleModule } from "@/app/dashboard/[guildId]/toggle-actions";

/**
 * One module on the overview grid: what it is, whether it is on, and a switch
 * that turns it on without opening the page. The whole point is that a server
 * owner can set the bot up from one screen and only dive into a module when
 * they actually want to tune it.
 */
export function ModuleCard({
  guildId,
  slug,
  feature,
  icon,
  name,
  description,
  detail,
  enabled,
  toggleable,
}: {
  guildId: string;
  slug: string;
  /** FEATURE_SCHEMAS key. Null (or toggleable: false) means no switch. */
  feature: string | null;
  icon: string;
  name: string;
  description: string;
  /** One line of live state, e.g. "3 panels". */
  detail: string;
  enabled: boolean;
  toggleable: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const href = `/dashboard/${guildId}/${slug}`;
  const showSwitch = toggleable && feature !== null;

  function flip() {
    if (!feature || pending) return;
    const next = !on;
    // Optimistic: the switch answers the click straight away, and rolls back if
    // the write fails. Waiting on a round-trip makes the grid feel broken.
    setOn(next);
    setError(null);
    startTransition(async () => {
      const res = await toggleModule(guildId, feature, next);
      if (!res.ok) {
        setOn(!next);
        setError(res.error);
      }
    });
  }

  return (
    <div
      className={`card flex flex-col gap-3 transition-colors ${
        showSwitch && on ? "border-blurple/40" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-white">{name}</div>
          <p className="mt-0.5 text-sm text-zinc-400">{description}</p>
        </div>

        {showSwitch ? (
          <button
            type="button"
            onClick={flip}
            disabled={pending}
            aria-pressed={on}
            aria-label={`${on ? "Disable" : "Enable"} ${name}`}
            className={`h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-60 ${
              on ? "bg-blurple" : "bg-edge"
            }`}
          >
            <span
              className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform ${
                on ? "translate-x-[22px]" : ""
              }`}
            />
          </button>
        ) : (
          <span className="flex-none rounded-full bg-zinc-600/30 px-2 py-0.5 text-xs font-medium text-zinc-400">
            {on ? "Active" : "Idle"}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-edge pt-3">
        <span className="min-w-0 truncate text-xs text-zinc-500">{detail}</span>
        <Link
          href={href}
          className="flex-none text-sm font-medium text-zinc-300 hover:text-white"
        >
          Configure →
        </Link>
      </div>
    </div>
  );
}
