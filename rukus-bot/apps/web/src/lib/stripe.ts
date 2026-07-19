import Stripe from "stripe";

/**
 * Lazily-created Stripe client, or null when this instance has no Stripe keys.
 *
 * Payments are OPTIONAL. A self-hoster who runs the bot for one server should
 * never be forced to open a Stripe account, so every billing surface has to
 * degrade to "billing is not set up" rather than throw. Returning null instead
 * of throwing at import time is what makes that possible: a module-level
 * `new Stripe(process.env.STRIPE_SECRET_KEY!)` would crash the whole dashboard
 * on boot, taking down twenty features because one optional one is unconfigured.
 */

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // apiVersion is deliberately omitted: the SDK's types accept only the exact
  // version this package was built against, so hardcoding one here breaks the
  // build on every `pnpm up stripe`. The default already pins to that version.
  cached = new Stripe(key, { typescript: true });
  return cached;
}

/**
 * Whether billing can work at all on this instance.
 *
 * Checkout needs a price to sell and the webhook needs a signing secret; with
 * either missing the buttons would 500 on click, so the UI hides them instead.
 */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

/**
 * Absolute origin for Stripe's return URLs.
 *
 * Stripe rejects relative paths, and the value must match the deployment the
 * buyer is actually on, so it comes from config rather than being guessed.
 */
export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
