import type Stripe from "stripe";
import { getSupabase, getSubscription, upsertSubscription } from "@rukus/supabase";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe webhook: the ONLY thing that grants or revokes premium.
 *
 * This is a PUBLIC, unauthenticated endpoint. Nothing about the request is
 * trusted until the Stripe signature over the raw body verifies, because a
 * forged POST that reached the database could hand its sender free premium
 * forever. Order matters throughout: verify, then dedupe, then write.
 */

// Never prerendered, never cached: every delivery must run the handler and read
// its own body. Static optimisation of a POST route would silently drop events.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Subscription statuses Stripe reports that we store verbatim. */
function periodEndOf(sub: Stripe.Subscription): Date | null {
  // The period lives on the subscription item in current API versions; the
  // top-level field is the legacy location. Read both so an account on either
  // API version still yields an expiry, since a null expiry means "no access".
  const item = sub.items?.data?.[0];
  const raw =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000) : null;
}

/** guildId travels in subscription metadata; session metadata is the fallback. */
function guildIdOf(sub: Stripe.Subscription): string | null {
  const id = sub.metadata?.guildId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function customerIdOf(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * Write subscription state, refusing to apply an event older than what is
 * stored.
 *
 * Stripe delivers AT LEAST ONCE and OUT OF ORDER. Without this comparison a
 * retried "cancelled" from Tuesday, arriving after Wednesday's renewal, would
 * revoke a customer who has already paid for the new period. The period end is
 * the ordering key because it only ever moves forward as a subscription renews.
 */
async function applySubscription(
  guildId: string,
  sub: Stripe.Subscription,
  purchasedByUserId: string,
): Promise<void> {
  const periodEnd = periodEndOf(sub);

  const existing = await getSubscription(guildId).catch(() => null);
  if (existing && periodEnd && existing.currentPeriodEnd) {
    // Strictly older: a repeat of the same period is fine to reapply (it is
    // idempotent), but a genuinely stale one must not overwrite newer state.
    if (periodEnd.getTime() < existing.currentPeriodEnd.getTime()) return;
  }

  await upsertSubscription(guildId, {
    // Keep the original buyer once one is recorded: later events come from
    // Stripe, which has no idea which Discord user clicked subscribe.
    purchasedByUserId:
      existing?.purchasedByUserId ?? purchasedByUserId,
    stripeCustomerId: customerIdOf(sub.customer),
    stripeSubscriptionId: sub.id,
    status: sub.status,
    // Only ever write a period end we actually parsed. If Stripe moves the
    // field again, or sends a shape we do not recognise, `periodEndOf` yields
    // null, and writing that would blank the paid-through date and revoke a
    // customer who has paid, since a null period end reads as "no access".
    // Omitting the key leaves the stored date standing until an event we can
    // read arrives. The stale-event guard above is skipped in this case too
    // (it needs a period to compare), which is the other reason not to write.
    ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    // manualUntil is deliberately not passed: a hand-granted comp must survive
    // whatever Stripe says.
  });
}

/** Fetch the full subscription an invoice belongs to. */
async function subscriptionOfInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<Stripe.Subscription | null> {
  const raw =
    (invoice as unknown as { subscription?: string | { id: string } })
      .subscription ??
    invoice.lines?.data?.[0]?.subscription ??
    null;
  const id = customerIdOf(raw as string | { id: string } | null);
  if (!id) return null;
  try {
    return await stripe.subscriptions.retrieve(id);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    // Not configured: tell Stripe to stop retrying rather than log forever.
    return new Response("Stripe is not configured", { status: 200 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // RAW body, unparsed. The signature is computed over the exact bytes Stripe
  // sent, so JSON.parse-ing first and re-serialising would break verification.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    // Nothing has touched the database at this point, which is the entire
    // reason the signature check comes first.
    const msg = err instanceof Error ? err.message : "bad signature";
    return new Response(`Webhook signature verification failed: ${msg}`, {
      status: 400,
    });
  }

  // Idempotency BEFORE any state change. The primary key on StripeEvent.id
  // makes the database, not this process, the thing that decides whether an
  // event is new, so two concurrent retries cannot both pass the check.
  const { error: claimError } = await getSupabase()
    .from("StripeEvent")
    .insert({ id: event.id, type: event.type });

  if (claimError) {
    // 23505 = unique violation: already processed, so ack and do nothing.
    if (claimError.code === "23505") {
      return new Response("Already processed", { status: 200 });
    }
    // A real database failure: 500 makes Stripe retry, which is what we want.
    return new Response(`Event claim failed: ${claimError.message}`, {
      status: 500,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const guildId =
          session.metadata?.guildId ?? session.client_reference_id ?? null;
        const discordId = session.metadata?.discordId ?? "unknown";
        const subId = customerIdOf(
          session.subscription as string | { id: string } | null,
        );
        if (guildId && subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscription(guildId, sub, discordId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const guildId = guildIdOf(sub);
        if (guildId) {
          const purchaser = sub.metadata?.discordId ?? "unknown";
          if (event.type === "customer.subscription.deleted") {
            // A deletion carries the period end it died at; write the terminal
            // status but let the stored period end stand, so someone who
            // cancelled keeps the days they already paid for.
            const existing = await getSubscription(guildId).catch(() => null);
            await upsertSubscription(guildId, {
              purchasedByUserId: existing?.purchasedByUserId ?? purchaser,
              status: "canceled",
              cancelAtPeriodEnd: true,
            });
          } else {
            await applySubscription(guildId, sub, purchaser);
          }
        }
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const sub = await subscriptionOfInvoice(stripe, invoice);
        if (sub) {
          const guildId = guildIdOf(sub);
          if (guildId) {
            // Renewal: the retrieved subscription already carries the new
            // period end and status, so the same path handles both outcomes.
            await applySubscription(
              guildId,
              sub,
              sub.metadata?.discordId ?? "unknown",
            );
          }
        }
        break;
      }

      default:
        // Stripe sends dozens of event types we never subscribed to caring
        // about. Anything but a 2xx makes it retry them for days.
        break;
    }
  } catch (err) {
    // The event id is already claimed, so a 500 retry would be deduped away and
    // the state change lost. Release the claim so Stripe's retry can redo it.
    await getSupabase().from("StripeEvent").delete().eq("id", event.id);
    const msg = err instanceof Error ? err.message : "handler failed";
    return new Response(`Webhook handling failed: ${msg}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
