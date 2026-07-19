import { addUsage } from "@rukus/db";
import { periodStartFor, type PremiumState } from "@rukus/shared";
import { premiumState, invalidatePremium } from "../../lib/premiumCache.js";
import { log } from "../../lib/logger.js";

/**
 * The paid-engine gate and its meter.
 *
 * Two rules decide who gets DeepL, and they are deliberately separate:
 *
 *   1. The OPERATOR's own guilds (DEEPL_ALLOWED_GUILD_IDS) are uncapped and
 *      unmetered. Whoever runs the bot already pays the DeepL invoice; making
 *      them buy their own product would be absurd, and metering them would burn
 *      a quota row nobody ever reads.
 *   2. Everyone else needs an ACTIVE subscription that is under the monthly
 *      character allowance. `premiumState` already folds the quota into
 *      `active`, so a single boolean answers both halves.
 *
 * Failing either rule is not an outage: the caller falls through to Google, so
 * translation still happens and only the engine changes.
 */

/**
 * Guilds the operator runs themselves.
 *
 * Parsed once at module load. It cannot change without a redeploy, and
 * re-splitting the string per message would be wasted work on the hot path.
 */
const OPERATOR_GUILDS = new Set(
  (process.env.DEEPL_ALLOWED_GUILD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Is this one of the operator's own guilds (uncapped, unmetered)? */
export function isOperatorGuild(guildId: string | undefined): boolean {
  return !!guildId && OPERATOR_GUILDS.has(guildId);
}

export interface DeeplAccess {
  /** May this guild spend a DeepL character right now? */
  allowed: boolean;
  /** Operator guilds are billed to the operator, so they are never metered. */
  metered: boolean;
}

/**
 * May this guild use the paid engine, and should its characters be counted?
 *
 * Reads through the 30s premium cache, so a busy guild costs one database round
 * trip per half-minute rather than one per message.
 */
export async function deeplAccess(
  guildId: string | undefined,
): Promise<DeeplAccess> {
  if (!guildId) return { allowed: false, metered: false };
  if (isOperatorGuild(guildId)) return { allowed: true, metered: false };

  const state = await premiumState(guildId);
  if (state.active) return { allowed: true, metered: true };

  // Crossing the allowance is worth saying out loud exactly once; a plain
  // "not subscribed" is the normal case for most guilds and stays silent.
  if (state.reason === "Monthly character limit reached") {
    noteQuotaReached(guildId, state);
  }
  return { allowed: false, metered: false };
}

/**
 * Record characters billed by a SUCCESSFUL DeepL call.
 *
 * Bills the INPUT length, which is what DeepL charges for: the response is free,
 * and counting it would overstate every guild's usage.
 *
 * Never throws and never awaits into the caller's critical path in a way that
 * can lose a translation. A metering failure means we undercount a few hundred
 * characters, which is strictly better than dropping a message the user is
 * waiting for, so the error is logged and swallowed.
 */
export async function meterDeepl(
  guildId: string | undefined,
  characters: number,
): Promise<void> {
  if (!guildId || characters <= 0) return;
  if (isOperatorGuild(guildId)) return;

  try {
    const periodStart = periodStartFor(new Date());
    await addUsage(guildId, periodStart, characters);
    // The cached state still holds the pre-increment total. Dropping it means
    // the next check re-reads, which is what makes the cap actually bite within
    // a TTL instead of overshooting for as long as the entry lives.
    invalidatePremium(guildId);
  } catch (err) {
    log.warn(
      `Translation metering failed for guild ${guildId} (${characters} chars not counted): ${String(err)}`,
    );
  }
}

// ---- "you hit the cap" notice, at most once per guild per month ----

/**
 * Guilds already told about this month's cap, keyed by `${guildId}|${period}`.
 *
 * Bounded because this is a public bot: an unbounded Set here would be a slow
 * leak of one entry per guild that ever runs out. The month is part of the key
 * so a new period naturally re-arms the notice.
 */
const NOTICE_MAX = 2_000;
const noticed = new Set<string>();

/**
 * Log the first time a paying guild runs out for the month.
 *
 * Deliberately NOT a per-message reply: the cap is hit on a hot path and a
 * message-level notice would spam the channel that is already busiest. The
 * dashboard reads the same `PremiumState` for its progress bar, so the state is
 * visible there continuously; this log line is what makes it findable in
 * operations without anyone watching the dashboard.
 */
function noteQuotaReached(guildId: string, state: PremiumState): void {
  const key = `${guildId}|${periodStartFor(new Date()).toISOString()}`;
  if (noticed.has(key)) return;

  if (noticed.size >= NOTICE_MAX) {
    const oldest = noticed.values().next().value;
    if (oldest !== undefined) noticed.delete(oldest);
  }
  noticed.add(key);

  log.info(
    `Guild ${guildId} reached its monthly translation allowance (${state.charactersUsed}/${state.charactersLimit} characters). Falling back to Google until the period resets.`,
  );
}
