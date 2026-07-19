/**
 * Pure premium entitlement rules.
 *
 * This lives in `shared` because three places have to agree on the single
 * question "has this guild paid?": the bot's hot path (before spending a metered
 * DeepL character), the dashboard (what the billing page renders), and the
 * Stripe webhook (what it writes back). If any two of those disagreed, someone
 * would either be billed for a feature they cannot use or use a feature they are
 * not paying for. Nothing here touches the network or a database: callers pass
 * the row they already read, plus `now`, so the rules are testable and the
 * dashboard can render "renews in 3 days" without a clock of its own.
 */

/** Metered DeepL characters included per month, per guild. */
export const PREMIUM_CHAR_LIMIT = 100_000;

export interface PremiumState {
  active: boolean;
  /** Why, in words the dashboard can show directly. */
  reason: string;
  charactersUsed: number;
  charactersLimit: number;
  renewsAt: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** The subscription fields the rules actually depend on. */
export interface SubscriptionLike {
  status: string;
  currentPeriodEnd: Date | null;
  manualUntil: Date | null;
}

/**
 * Does this subscription entitle the guild to premium right now?
 *
 * The bias throughout is toward the CUSTOMER: every rule that could go either
 * way resolves to "they keep access". Wrongly granting a few free days costs a
 * fraction of a cent; wrongly cutting off a paying server breaks their support
 * flow mid-conversation and they churn.
 */
export function isSubscriptionActive(
  sub: SubscriptionLike,
  now: Date,
): boolean {
  // A hand-granted comp or trial outranks Stripe entirely: there may be no
  // Stripe record at all, and when there is a stale one, the human who typed
  // the grant is the more recent authority.
  if (sub.manualUntil && sub.manualUntil.getTime() > now.getTime()) return true;

  const end = sub.currentPeriodEnd;
  // Without a period end there is nothing paid for to honour.
  if (!end || end.getTime() <= now.getTime()) return false;

  switch (sub.status) {
    case "active":
    case "trialing":
      return true;
    // Stripe retries a failed card for days before giving up. Cutting a paying
    // customer off mid-period over a temporary decline is worse than the few
    // free days it costs to wait for the retries to resolve.
    case "past_due":
      return true;
    // They cancelled but already paid through the end of the period. Taking the
    // remainder away would be charging for time and not delivering it.
    case "canceled":
      return true;
    // "incomplete" (first payment never succeeded) and anything Stripe adds
    // later: unknown means unpaid.
    default:
      return false;
  }
}

/**
 * First instant of the UTC month containing `now`, the key a usage row counts
 * under. UTC, not local time, so the bot and the dashboard bucket a message the
 * same way regardless of which region either happens to run in.
 */
export function periodStartFor(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
}

/** Characters left in the monthly allowance, floored at zero. */
export function quotaRemaining(used: number, limit: number): number {
  return Math.max(0, limit - used);
}
