import type { Client } from "discord.js";
import { prisma } from "@rukus/db";
import { giveawaysConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import { endGiveaway } from "./service.js";

/**
 * Ends giveaways whose time is up.
 *
 * A sweeper rather than a per-giveaway setTimeout, because timers do not
 * survive a Railway redeploy: after a restart the DB is the only record of what
 * is still running, so the DB has to be what we poll. The 30s interval bounds
 * how late an end can be, which is well inside what anyone notices.
 */

const SWEEP_INTERVAL_MS = 30_000;

/** One pass: end every due giveaway across every guild the bot serves. */
export async function sweepDueGiveaways(client: Client): Promise<void> {
  let due;
  try {
    due = await prisma.giveaway.findMany({
      where: { ended: false, endsAt: { lte: new Date() } },
    });
  } catch (err) {
    log.error("Giveaway sweep query failed:", err);
    return;
  }

  for (const giveaway of due) {
    try {
      const guild =
        client.guilds.cache.get(giveaway.guildId) ??
        (await client.guilds.fetch(giveaway.guildId).catch(() => null));

      // The bot was removed from the guild. Retire the row so we stop retrying
      // it on every pass forever.
      if (!guild) {
        await prisma.giveaway.update({
          where: { id: giveaway.id },
          data: { ended: true },
        });
        continue;
      }

      const config = await giveawaysConfig(giveaway.guildId);
      const result = await endGiveaway(guild, giveaway, config);
      // null = staff ended it manually between our query and now.
      if (!result) continue;
      log.info(
        `Ended giveaway ${giveaway.id} ("${giveaway.prize}") with ${result.winners.length} winner(s).`,
      );
    } catch (err) {
      log.error(`Failed to end giveaway ${giveaway.id}:`, err);
    }
  }
}

/** Start the recurring sweep (first pass shortly after boot). */
export function startGiveawaySweeper(client: Client): void {
  setTimeout(() => void sweepDueGiveaways(client), 15_000);
  setInterval(() => void sweepDueGiveaways(client), SWEEP_INTERVAL_MS);
  log.info("Giveaway sweeper started (every 30s).");
}
