import { getSubscription, getUsage } from "@rukus/supabase";
import {
  PREMIUM_CHAR_LIMIT,
  isSubscriptionActive,
  periodStartFor,
} from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";
import { isGuildAdmin } from "@/lib/discord";
import { stripeConfigured } from "@/lib/stripe";
import { PremiumPanel } from "./PremiumPanel";

export default async function PremiumPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  // Everyone with dashboard access may LOOK at the billing state (staff should
  // be able to see why translation stopped). Only admins get the buttons, and
  // the actions re-check that server-side.
  const { guild } = await requireGuildAccess(guildId);
  const canManageBilling = isGuildAdmin(guild);

  const now = new Date();
  const periodStart = periodStartFor(now);

  // A failed read must not render as "no subscription": that would invite a
  // paying customer to buy a second one. Distinguish "none" from "unknown".
  let sub: Awaited<ReturnType<typeof getSubscription>> = null;
  let readFailed = false;
  try {
    sub = await getSubscription(guildId);
  } catch {
    readFailed = true;
  }

  let charactersUsed = 0;
  try {
    const usage = await getUsage(guildId, periodStart);
    charactersUsed = usage?.characters ?? 0;
  } catch {
    // Usage is informational; a failure here should not blank the whole page.
    charactersUsed = 0;
  }

  const active = sub ? isSubscriptionActive(sub, now) : false;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">✨ Premium</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Premium unlocks DeepL translation, the higher-quality engine, with{" "}
        {PREMIUM_CHAR_LIMIT.toLocaleString()} characters a month. Without it the
        bot falls back to free translation.
      </p>

      <PremiumPanel
        guildId={guildId}
        configured={stripeConfigured()}
        canManageBilling={canManageBilling}
        readFailed={readFailed}
        hasSubscription={sub !== null}
        active={active}
        status={sub?.status ?? "inactive"}
        renewsAt={sub?.currentPeriodEnd?.toISOString() ?? null}
        cancelAtPeriodEnd={sub?.cancelAtPeriodEnd ?? false}
        manualUntil={sub?.manualUntil?.toISOString() ?? null}
        charactersUsed={charactersUsed}
        charactersLimit={PREMIUM_CHAR_LIMIT}
      />
    </div>
  );
}
