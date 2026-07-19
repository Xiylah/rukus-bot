import type { Client } from "discord.js";
import { prisma } from "@rukus/db";
import { log } from "../../lib/logger.js";

/**
 * Deletes ActiveBoost rows that have expired.
 *
 * Same reasoning as the giveaway sweeper: a setTimeout per boost does not
 * survive a Railway redeploy, so the expiry has to be a timestamp the DB owns
 * and a poller has to be what notices. Nothing user-visible depends on this
 * running promptly (activeMultiplier already filters on `expiresAt > now`, so
 * an expired boost stops applying the instant it lapses whether or not the row
 * is gone); the sweep is housekeeping to stop the table growing forever, which
 * is why it runs every five minutes rather than every thirty seconds.
 *
 * Temp roles bought from the shop are NOT swept here: those go through
 * /temprole's existing state and its sweeper already removes them.
 */

const SWEEP_INTERVAL_MS = 300_000;

/** One pass: bin every lapsed boost across every guild. */
export async function sweepExpiredBoosts(): Promise<void> {
  try {
    const result = await prisma.activeBoost.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    if (result.count > 0) {
      log.info(`Swept ${result.count} expired XP boost(s).`);
    }
  } catch (err) {
    log.error("Boost sweep failed:", err);
  }
}

/** Start the recurring sweep (first pass shortly after boot). */
export function startShopSweeper(_client: Client): void {
  setTimeout(() => void sweepExpiredBoosts(), 45_000);
  setInterval(() => void sweepExpiredBoosts(), SWEEP_INTERVAL_MS);
  log.info("Shop boost sweeper started (every 5m).");
}
