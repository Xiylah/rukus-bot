import type { Client } from "discord.js";
import { prisma } from "@rukus/db";
import { contestsConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import { endContest } from "./service.js";
import { maybeStartRecurring } from "./recurring.js";

/**
 * Ends contests whose timer has run out, and starts scheduled ones.
 *
 * A DB-polling sweeper rather than a per-contest setTimeout, for the same reason
 * giveaways use one: an in-memory timer does not survive a Railway redeploy, so
 * after a restart the database is the only record of what is still running.
 */

const SWEEP_INTERVAL_MS = 30_000;

/**
 * Recurring contests are checked far less often than contests are ended: an
 * occurrence is due for a whole hour (isOccurrenceDue uses >=), so polling it
 * every 30s would be ~120 wasted config reads per guild per hour.
 */
const RECURRING_INTERVAL_MS = 5 * 60_000;

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

/**
 * True while a recurring pass is in flight.
 *
 * maybeStartRecurring's double-start guard is a read (has an auto-started
 * contest been created today?) followed by a create, which is only safe if no
 * second pass can run between the two. setInterval does NOT wait for the
 * previous tick, and a pass is O(guilds) sequential DB reads plus channel
 * fetches and message sends, so on a public bot it can outlive the 5 minute
 * interval; the next tick would then re-read "nothing started today" for a
 * guild the running pass is mid-way through starting, and announce it twice.
 * A single Contest row cannot express the guard (there is no unique key to
 * collide on), so the overlap is prevented here instead.
 */
let recurringSweepRunning = false;

/**
 * One pass over every guild, starting any scheduled contest that is due.
 *
 * Iterates the cache rather than querying, because a schedule lives in config
 * (not in a table we could filter on), so there is nothing to query for.
 */
export async function sweepRecurringContests(client: Client): Promise<void> {
  // Skipping is always safe: an occurrence stays due for the rest of the local
  // hour (isOccurrenceDue uses >=), so the next tick picks up anything missed.
  if (recurringSweepRunning) {
    log.warn("Recurring contest sweep still running, skipping this pass.");
    return;
  }
  recurringSweepRunning = true;
  try {
    await runRecurringPass(client);
  } finally {
    // finally, not after the await: a throw that escaped the per-guild catch
    // would otherwise wedge the flag on and stop every future pass.
    recurringSweepRunning = false;
  }
}

async function runRecurringPass(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await contestsConfig(guild.id);
      if (!config.recurringEnabled) continue;
      const started = await maybeStartRecurring(guild, config);
      if (started) {
        log.info(
          `Auto-started recurring contest "${started.title}" in guild ${guild.id}.`,
        );
      }
    } catch (err) {
      log.error(`Recurring contest check failed for guild ${guild.id}:`, err);
    }
  }
}

/** Start the recurring sweep (first pass shortly after boot). */
export function startContestSweeper(client: Client): void {
  setTimeout(() => void sweepDueContests(client), 20_000);
  setInterval(() => void sweepDueContests(client), SWEEP_INTERVAL_MS);

  setTimeout(() => void sweepRecurringContests(client), 40_000);
  setInterval(() => void sweepRecurringContests(client), RECURRING_INTERVAL_MS);

  log.info("Contest sweeper started (ending every 30s, schedule every 5m).");
}
