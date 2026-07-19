"use server";

import { getSubscription } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { isGuildAdmin } from "@/lib/discord";
import { getStripe, appUrl } from "@/lib/stripe";

/**
 * Billing server actions.
 *
 * Both actions re-check admin rights server-side rather than trusting the page
 * that rendered the button. The page hides the buttons from non-admins, but a
 * server action is a public POST endpoint: anyone who can read the dashboard
 * could invoke it directly, so hiding a button is decoration, not a gate.
 */

type ActionResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Resolve the caller and refuse unless they are an Administrator of THIS guild.
 *
 * requireGuildAccess alone is not enough: it also admits staff-role and
 * allow-list users, who may configure the bot but must not be able to start or
 * cancel a paid subscription on the owner's card.
 */
async function requireBillingAdmin(guildId: string) {
  const { session, guild } = await requireGuildAccess(guildId);
  if (!isGuildAdmin(guild)) return null;
  return { discordId: session.discordId!, guild };
}

export async function startCheckout(guildId: string): Promise<ActionResult> {
  const admin = await requireBillingAdmin(guildId);
  if (!admin) {
    return { ok: false, error: "Only a server Administrator can start a subscription." };
  }

  const stripe = getStripe();
  const price = process.env.STRIPE_PRICE_ID;
  if (!stripe || !price) {
    return { ok: false, error: "Billing is not set up on this instance." };
  }

  const base = `${appUrl()}/dashboard/${guildId}/premium`;

  // guildId and the buyer go in BOTH places on purpose. Session metadata covers
  // checkout.session.completed, but every later event (renewal invoices,
  // cancellations) arrives attached to the SUBSCRIPTION and never mentions the
  // session, so without subscription_data.metadata a renewal three months from
  // now would arrive with nothing identifying which guild it pays for.
  const metadata = { guildId, discordId: admin.discordId };

  try {
    const existing = await getSubscription(guildId).catch(() => null);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${base}?checkout=success`,
      cancel_url: `${base}?checkout=cancelled`,
      metadata,
      subscription_data: { metadata },
      // Reuse the Stripe customer when this guild has subscribed before, so a
      // resubscribe lands on the same customer instead of creating a duplicate
      // with its own detached card and invoice history.
      ...(existing?.stripeCustomerId
        ? { customer: existing.stripeCustomerId }
        : {}),
      client_reference_id: guildId,
    });

    if (!session.url) {
      return { ok: false, error: "Stripe did not return a checkout URL." };
    }
    return { ok: true, url: session.url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stripe checkout failed.",
    };
  }
}

/**
 * Open Stripe's hosted billing portal, where the customer can change their card,
 * see invoices or cancel. Hosted rather than hand-built: card collection and
 * cancellation flows are exactly the surfaces worth not reimplementing.
 */
export async function openBillingPortal(guildId: string): Promise<ActionResult> {
  const admin = await requireBillingAdmin(guildId);
  if (!admin) {
    return { ok: false, error: "Only a server Administrator can manage billing." };
  }

  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Billing is not set up on this instance." };

  let sub: Awaited<ReturnType<typeof getSubscription>>;
  try {
    sub = await getSubscription(guildId);
  } catch {
    return { ok: false, error: "Could not read this server's subscription." };
  }

  if (!sub?.stripeCustomerId) {
    return { ok: false, error: "This server has no Stripe customer to manage yet." };
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl()}/dashboard/${guildId}/premium`,
    });
    return { ok: true, url: portal.url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stripe billing portal failed.",
    };
  }
}
