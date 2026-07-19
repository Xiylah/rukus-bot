import { log } from "../../lib/logger.js";
import {
  addCoins,
  getBalance,
  removeCoins,
} from "../economy/service.js";

/**
 * The shop's ONLY door to the currency.
 *
 * Every function here delegates to the economy service: the shop never touches
 * the Balance table itself. Keeping the seam in one thin file means the atomic
 * guarantees live in exactly one place (economy/service.ts) and the shop cannot
 * accidentally grow a second, weaker way to move money.
 */

/**
 * Take `amount` off a member's balance, but only if they can cover it.
 *
 * Returns false when they cannot afford it. Callers MUST NOT check the balance
 * first and then call this: removeCoins puts the affordability test in the
 * UPDATE's WHERE clause so Postgres decides the winner of a race. A prior read
 * would reintroduce exactly the double-spend that guard exists to prevent.
 */
export async function debit(
  guildId: string,
  userId: string,
  amount: bigint,
  reason: string,
): Promise<boolean> {
  return removeCoins(guildId, userId, amount, reason, "shop");
}

/**
 * Put `amount` back after an effect could not be applied.
 *
 * countLifetime=false: a refund is money the member already had, not money they
 * earned, so counting it again would inflate their all-time total every time a
 * purchase failed.
 *
 * Deliberately has no failure mode the caller must handle. A refund that threw
 * would leave someone charged for nothing, so it swallows and logs loudly
 * instead of propagating.
 */
export async function credit(
  guildId: string,
  userId: string,
  amount: bigint,
  reason: string,
): Promise<void> {
  try {
    await addCoins(guildId, userId, amount, reason, "refund", false);
  } catch (err) {
    // Loud: a swallowed refund is money quietly taken from a member.
    log.error(
      `REFUND FAILED for ${userId} in ${guildId} (${amount}): ${String(err)}`,
    );
  }
}

/** Read-only, for display. Never gate a spend on this: use debit's return. */
export async function balanceOf(guildId: string, userId: string): Promise<bigint> {
  const row = await getBalance(guildId, userId);
  return row.amount;
}
