"use client";

import { useState, useTransition } from "react";
import { startCheckout, openBillingPortal } from "./actions";

/**
 * The billing panel. Dates arrive as ISO strings rather than Date objects
 * because a server component cannot hand a Date across the client boundary,
 * and they are formatted here so the browser's own locale/timezone is used.
 */
export function PremiumPanel({
  guildId,
  configured,
  canManageBilling,
  readFailed,
  hasSubscription,
  active,
  status,
  renewsAt,
  cancelAtPeriodEnd,
  manualUntil,
  charactersUsed,
  charactersLimit,
}: {
  guildId: string;
  configured: boolean;
  canManageBilling: boolean;
  readFailed: boolean;
  hasSubscription: boolean;
  active: boolean;
  status: string;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  manualUntil: string | null;
  charactersUsed: number;
  charactersLimit: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pct = Math.min(
    100,
    Math.round((charactersUsed / Math.max(1, charactersLimit)) * 100),
  );
  const overQuota = charactersUsed >= charactersLimit;

  function fmt(iso: string | null): string {
    if (!iso) return "unknown";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function go(action: (id: string) => Promise<
    { ok: true; url: string } | { ok: false; error: string }
  >) {
    setError(null);
    startTransition(async () => {
      const res = await action(guildId);
      // Stripe's hosted pages must be a full navigation, not a fetch.
      if (res.ok) window.location.href = res.url;
      else setError(res.error);
    });
  }

  if (readFailed) {
    return (
      <div className="card">
        <p className="text-sm text-red-400">
          Could not read this server&apos;s billing status. Nothing has changed,
          and any active subscription is unaffected. Try again in a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-white">Status</div>
          <span
            className={`flex-none rounded-full px-2 py-0.5 text-xs font-medium ${
              active
                ? "bg-green-500/15 text-green-400"
                : "bg-zinc-600/30 text-zinc-400"
            }`}
          >
            {active ? "Active" : "Inactive"}
          </span>
        </div>

        {manualUntil && (
          <p className="text-sm text-zinc-400">
            Granted manually until <strong>{fmt(manualUntil)}</strong>.
          </p>
        )}

        {!hasSubscription && !manualUntil && (
          <p className="text-sm text-zinc-400">
            This server is on the free plan.
          </p>
        )}

        {hasSubscription && renewsAt && (
          <p className="text-sm text-zinc-400">
            {cancelAtPeriodEnd ? (
              <>
                Cancelled. Access ends on <strong>{fmt(renewsAt)}</strong>, and
                you keep everything until then.
              </>
            ) : (
              <>
                Renews on <strong>{fmt(renewsAt)}</strong>.
              </>
            )}
          </p>
        )}

        {hasSubscription && (
          <p className="text-xs text-zinc-500">
            Stripe status: <strong>{status}</strong>
          </p>
        )}

        {status === "past_due" && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            The last payment failed. Stripe will retry for a few days, and you
            keep access meanwhile. Update your card to avoid losing it.
          </p>
        )}
      </div>

      <div className="card space-y-3">
        <div className="font-medium text-white">This month&apos;s usage</div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-edge">
          <div
            className={`h-full rounded-full transition-all ${
              overQuota ? "bg-red-500" : "bg-blurple"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-sm text-zinc-400">
          {charactersUsed.toLocaleString()} of{" "}
          {charactersLimit.toLocaleString()} characters ({pct}%)
        </p>
        {overQuota && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            The monthly allowance is used up, so translation has fallen back to
            the free engine. It resets on the 1st.
          </p>
        )}
        <p className="text-xs text-zinc-500">
          Counts DeepL characters only, and resets on the 1st of each month.
        </p>
      </div>

      {!configured ? (
        <div className="card">
          <div className="mb-1 font-medium text-white">
            Billing is not set up on this instance
          </div>
          <p className="text-sm text-zinc-400">
            Whoever hosts this bot has not configured Stripe, so there is nothing
            to subscribe to here. Premium can still be granted manually in the
            database.
          </p>
        </div>
      ) : !canManageBilling ? (
        <div className="card">
          <p className="text-sm text-zinc-400">
            Only a server <strong>Administrator</strong> can change billing for
            this server.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {active || hasSubscription ? (
            <button
              className="btn-primary"
              disabled={pending}
              onClick={() => go(openBillingPortal)}
            >
              {pending ? "Opening…" : "Manage billing"}
            </button>
          ) : (
            <button
              className="btn-primary"
              disabled={pending}
              onClick={() => go(startCheckout)}
            >
              {pending ? "Starting…" : "Subscribe"}
            </button>
          )}
          {error && <span className="text-red-400">{error}</span>}
        </div>
      )}
    </div>
  );
}
