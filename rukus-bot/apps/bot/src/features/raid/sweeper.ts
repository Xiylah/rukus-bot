import { type Client } from "discord.js";
import { log } from "../../lib/logger.js";
import { raidConfig } from "../../lib/configCache.js";
import { getRaidState } from "./state.js";
import { liftRaid } from "./service.js";

/**
 * Auto-lift sweep for raid mode.
 *
 * A timed raid records a `liftAt` epoch in durable state; this pass ends any
 * raid whose lift time has arrived. State is in the database, so a redeploy
 * cannot lose a pending lift, the same guarantee the temp-role/lockdown sweeper
 * gives.
 *
 * It is self-starting (see ensureRaidSweeper) rather than wired into the shared
 * ready.ts, so the raid feature ships without editing a file it does not own.
 *
 * CAREFUL: it must be started from every path that can leave a lift pending, not
 * just from a join. A tripped raid is precisely what stops joins arriving (it
 * kicks or locks), so "the next join will start the sweeper" is not a guarantee:
 * after a restart with a raid already active, no join may ever come, and the
 * server would stay locked forever. triggerRaid starts it too, and the interval
 * is unref'd so an idle sweeper cannot hold the process open.
 */

const SWEEP_INTERVAL_MS = 60_000;
let started = false;

async function sweepOnce(client: Client): Promise<void> {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    try {
      const state = await getRaidState(guild.id);
      if (!state.active || state.liftAt === null || state.liftAt > now) continue;
      const config = await raidConfig(guild.id);
      await liftRaid(guild, config, "auto-lift timer");
    } catch (err) {
      log.error(`Raid auto-lift sweep failed for guild ${guild.id}:`, err);
    }
  }
}

/**
 * Start the recurring auto-lift sweep once. Idempotent: safe to call on every
 * join and from triggerRaid.
 */
export function ensureRaidSweeper(client: Client): void {
  if (started) return;
  started = true;
  const timer = setInterval(() => void sweepOnce(client), SWEEP_INTERVAL_MS);
  // Don't keep the process alive just to poll for a lift that may never be due.
  timer.unref?.();
  log.info("Raid auto-lift sweeper started (every 60s).");
}
