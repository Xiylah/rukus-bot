"use client";

import { useState, useTransition } from "react";
import { toggleModule } from "@/app/dashboard/[guildId]/toggle-actions";

/**
 * The header every module page opens with: what this page is, what it does, and
 * the master switch in the corner.
 *
 * The switch writes through the same server action the overview grid uses, so a
 * module is on or off in exactly one place no matter where you flipped it. Pages
 * whose feature has no master switch simply omit `feature`.
 */
export function PageHeader({
  icon,
  title,
  description,
  guildId,
  feature,
  enabled,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  /** Provide guildId + feature + enabled to render the master switch. */
  guildId?: string;
  feature?: string;
  enabled?: boolean;
  /** Optional extra control (a button, a link) shown beside the switch. */
  action?: React.ReactNode;
}) {
  const [on, setOn] = useState(enabled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const showSwitch = !!guildId && !!feature && enabled !== undefined;

  function flip() {
    if (!guildId || !feature || pending) return;
    const next = !on;
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
    <div className="mb-6 border-b border-edge pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="text-3xl leading-none">
            {icon}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            <p className="mt-1 text-sm text-zinc-400">{description}</p>
          </div>
        </div>

        <div className="flex flex-none items-center gap-3">
          {action}
          {showSwitch && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">{on ? "Enabled" : "Disabled"}</span>
              <button
                type="button"
                onClick={flip}
                disabled={pending}
                aria-pressed={on}
                aria-label={`${on ? "Disable" : "Enable"} ${title}`}
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
            </div>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
