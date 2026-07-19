import type { Client } from "discord.js";
import { prisma } from "@rukus/db";
import { contestsConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import { endContest } from "./service.js";

/**
 * Ends contests whose timer has run out.
 *
 * A DB-polling sweeper rather than a per-contest setTimeout, for the same reason
 * giveaways use one: an in-memory timer does not survive a Railway redeploy, so
 * after a restart the database is the only record of what is still running.
 */

const SWEEP_INTERVAL_MS = 30_000;

/** One pass: end every due contest across every guild the bot serves. */
export async function sweepDueContests(client: Client): Promise<void> {
  let due;
  try {
    due = await prisma.contest.findMany({
      where: { ended: false, endsAt: { lte: new Date() } },
    });
  } catch (err) {
    log.error("Contest sweep query failed:", err);
    return;
  }

  for (const contest of due) {
    try {
      const guild =
        client.guilds.cache.get(contest.guildId) ??
        (await client.guilds.fetch(contest.guildId).catch(() => null));

      // The bot was removed from the guild. Retire the row so we stop retrying
      // it on every pass forever.
      if (!guild) {
        await prisma.contest.update({
          where: { id: contest.id },
          data: { ended: true },
        });
        continue;
      }

      const config = await contestsConfig(contest.guildId);
      const result = await endContest(guild, contest, config);
      if (!result) continue; // someone ended it manually first
      log.info(
        `Ended contest ${contest.id} ("${contest.title}") with ${result.winners.length} winner(s).`,
      );
    } catch (err) {
      log.error(`Failed to end contest ${contest.id}:`, err);
    }
  }
}

/** Start the recurring sweep (first pass shortly after boot). */
export function startContestSweeper(client: Client): void {
  setTimeout(() => void sweepDueContests(client), 20_000);
  setInterval(() => void sweepDueContests(client), SWEEP_INTERVAL_MS);
  log.info("Contest sweeper started (every 30s).");
}
