import {
  ChannelType,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type VoiceState,
} from "discord.js";
import { prisma } from "@rukus/db";
import type { EconomyConfig } from "@rukus/shared";
import { economyConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import { addCoins, getBalance } from "./service.js";

/**
 * Earning currency from activity.
 *
 * Shaped to match features/leveling/xp.ts and voice.ts on purpose. The two
 * features are visible side by side to members ("I got XP but no coins?"), so
 * the ignore lists, the cooldown, the role multipliers and the voice anti-farm
 * rule all behave identically. The differences are only the ones the economy
 * genuinely has: a database-backed cooldown, and the shop's timed boosts.
 */

/**
 * Pick the single best multiplier a member qualifies for.
 *
 * Highest, not product, matching rollXp's rule in @rukus/shared. Multiplying
 * them together means someone holding four booster-ish roles earns 16x, which
 * is never what a server that set "2x for boosters" intended.
 */
function roleMultiplier(config: EconomyConfig, member: GuildMember): number {
  const owned = config.multiplierRoles
    .filter((m) => member.roles.cache.has(m.roleId))
    .map((m) => m.multiplier);
  return owned.length > 0 ? Math.max(...owned) : 1;
}

/**
 * The best live shop boost for a member, or 1.
 *
 * Read per payout rather than cached: a boost bought seconds ago has to start
 * working immediately, and this is one indexed lookup on a row the member
 * usually does not have at all.
 */
async function boostMultiplier(
  guildId: string,
  userId: string,
): Promise<number> {
  const boosts = await prisma.activeBoost.findMany({
    where: { guildId, userId, expiresAt: { gt: new Date() } },
    select: { multiplier: true },
  });
  return boosts.length > 0
    ? Math.max(...boosts.map((b) => b.multiplier))
    : 1;
}

/** Roll a payout in the configured range, tolerating a min above the max. */
function rollAmount(config: EconomyConfig): number {
  // perMessageMin/Max are bounded independently by the schema and are NOT
  // cross-validated there, so a saved config really can have min > max. Clamp
  // here rather than trusting the ordering, or the range goes negative.
  const lo = Math.min(config.perMessageMin, config.perMessageMax);
  const hi = Math.max(config.perMessageMin, config.perMessageMax);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Claim this member's earn slot, returning false when they are still inside
 * their cooldown.
 *
 * Backed by Balance.lastEarnAt rather than an in-memory map. A Map keyed by
 * guild and user on a public bot is exactly the unbounded-growth leak this repo
 * has already been bitten by twice, and the column is already there.
 *
 * The stamp is what claims the slot, and it is a CONDITIONAL update, matching
 * claimDaily. A read-then-write here (SELECT lastEarnAt, pay, then stamp) is
 * farmable: a member firing several messages in the same instant has every one
 * of them read the same stale timestamp before any stamp lands, so every one
 * pays out. Putting the cutoff in the WHERE clause makes Postgres decide the
 * winner under the row lock, so exactly one message per cooldown window can
 * ever get count 1.
 *
 * Claiming BEFORE the credit rather than after also costs the member at most
 * one payout if the credit then fails, instead of handing a retry loop a free
 * uncooldowned earn every time the database blips.
 */
async function claimEarnSlot(
  guildId: string,
  userId: string,
  cooldownSec: number,
  startingBalance: number,
): Promise<boolean> {
  if (cooldownSec <= 0) return true;

  // Grants startingBalance if this is the member's first sight. It only creates
  // a row when there is something to grant, so the explicit insert below is
  // still needed to guarantee the conditional stamp has a row to match.
  await getBalance(guildId, userId, startingBalance);

  const now = new Date();
  const cutoff = new Date(now.getTime() - cooldownSec * 1000);

  const claimed = await prisma.balance.updateMany({
    where: {
      guildId,
      userId,
      OR: [{ lastEarnAt: null }, { lastEarnAt: { lte: cutoff } }],
    },
    data: { lastEarnAt: now },
  });
  if (claimed.count > 0) return true;

  // Zero rows means either "still on cooldown" or "no row at all" (a server
  // with no starting balance does not get one until its first payout). Only the
  // second earns. skipDuplicates settles the race between two simultaneous
  // first messages: the loser gets count 0 and waits, rather than earning twice.
  const inserted = await prisma.balance.createMany({
    data: [{ guildId, userId, lastEarnAt: now }],
    skipDuplicates: true,
  });
  return inserted.count > 0;
}

/**
 * The message hook.
 *
 * Best-effort like handleMessageXp: coins are a nice-to-have and a database
 * blip must never take down the message pipeline that also runs anti-spam and
 * the filters, so the whole body is wrapped.
 */
export async function handleMessageEarn(message: Message<true>): Promise<void> {
  try {
    const config = await economyConfig(message.guildId);
    if (!config.enabled) return;
    if (config.ignoreChannelIds.includes(message.channelId)) return;

    const member = message.member;
    if (!member) return;
    if (config.ignoreRoleIds.some((id) => member.roles.cache.has(id))) return;

    const base = rollAmount(config);
    if (base <= 0) return;

    // Claimed before the payout: this both rate-limits and reserves the slot,
    // so two messages in the same instant cannot both earn.
    if (
      !(await claimEarnSlot(
        message.guildId,
        member.id,
        config.messageCooldownSec,
        config.startingBalance,
      ))
    ) {
      return;
    }

    const boost = await boostMultiplier(message.guildId, member.id);
    const amount = Math.floor(base * roleMultiplier(config, member) * boost);
    if (amount <= 0) return;

    await addCoins(
      message.guildId,
      member.id,
      amount,
      "Message activity",
      "message",
    );
  } catch (err) {
    log.warn(`Economy: message earn failed: ${String(err)}`);
  }
}

// ---------------- Voice earning ----------------

const TICK_MS = 60_000;
/** Never pay out more than this in one tick, whatever the clock did. */
const MAX_MINUTES_PER_TICK = 2;

/**
 * When each member's currently-unpaid voice time started, keyed guildId:userId.
 *
 * Bounded by construction: an entry is only ever added for a member the gateway
 * currently reports as sitting in a voice channel, and every sweep deletes the
 * entries of everyone who has stopped earning. handleVoiceStateEarn also drops
 * anyone who leaves voice outright. A guild the bot is removed from is cleared
 * by forgetGuild.
 */
const since = new Map<string, number>();

const key = (guildId: string, userId: string) => `${guildId}:${userId}`;

/** Whether this member, right now, is in a call that earns currency. */
function isEarning(
  state: VoiceState,
  config: EconomyConfig,
  member: GuildMember,
  headcount: number,
): boolean {
  if (!state.channelId) return false;
  if (member.user.bot) return false;
  if (config.ignoreChannelIds.includes(state.channelId)) return false;
  if (config.ignoreRoleIds.some((id) => member.roles.cache.has(id))) return false;
  if (headcount < config.voiceMinMembers) return false;
  return true;
}

/** One pass over a single guild's voice channels. */
async function sweepGuild(guild: Guild, now: number): Promise<void> {
  const config = await economyConfig(guild.id);
  if (!config.enabled || config.perVoiceMinute <= 0) return;

  for (const channel of guild.channels.cache.values()) {
    if (
      channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildStageVoice
    ) {
      continue;
    }

    // Bots parked in a call must not be what makes the room "busy enough" for
    // the person sitting there alone to farm it.
    const humans = channel.members.filter((m) => !m.user.bot);
    const headcount = humans.size;

    for (const member of humans.values()) {
      const id = key(guild.id, member.id);

      if (!isEarning(member.voice, config, member, headcount)) {
        // Drop the clock so they cannot bank time by going AFK and coming back
        // to a minute's credit.
        since.delete(id);
        continue;
      }

      const start = since.get(id);
      if (start === undefined) {
        since.set(id, now);
        continue;
      }

      const minutes = Math.min(
        MAX_MINUTES_PER_TICK,
        Math.floor((now - start) / 60_000),
      );
      if (minutes < 1) continue;

      // Carry the remainder forward rather than resetting to `now`, or a member
      // loses a few seconds of credit every tick.
      since.set(id, start + minutes * 60_000);

      try {
        const boost = await boostMultiplier(guild.id, member.id);
        const amount = Math.floor(
          config.perVoiceMinute *
            minutes *
            roleMultiplier(config, member) *
            boost,
        );
        if (amount <= 0) continue;

        await addCoins(guild.id, member.id, amount, "Voice activity", "voice");
      } catch (err) {
        log.warn(`Economy: voice earn failed: ${String(err)}`);
      }
    }
  }
}

/** One pass over every guild the bot serves. */
export async function sweepVoiceEarn(client: Client): Promise<void> {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    try {
      await sweepGuild(guild, now);
    } catch (err) {
      log.error(`Economy: voice earn sweep failed for guild ${guild.id}:`, err);
    }
  }
}

/**
 * The voiceStateUpdate hook. The sweeper does the awarding; this only forgets
 * the clock of anyone who has left voice, so their entry cannot linger and pay
 * out if they rejoin later.
 */
export function handleVoiceStateEarn(
  before: VoiceState,
  after: VoiceState,
): void {
  const guildId = after.guild?.id ?? before.guild?.id;
  const userId = after.id ?? before.id;
  if (!guildId || !userId) return;
  if (before.channelId === after.channelId) return;
  if (!after.channelId) since.delete(key(guildId, userId));
}

/** Drop every clock for a guild the bot has been removed from. */
export function forgetGuild(guildId: string): void {
  const prefix = `${guildId}:`;
  for (const id of since.keys()) {
    if (id.startsWith(prefix)) since.delete(id);
  }
}

/** Start the recurring voice earn sweep. */
export function startVoiceEarnSweeper(client: Client): void {
  setInterval(() => void sweepVoiceEarn(client), TICK_MS);
  log.info("Economy voice earn sweeper started (every 60s).");
}
