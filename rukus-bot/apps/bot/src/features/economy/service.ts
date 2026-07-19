import { prisma } from "@rukus/db";

/**
 * The balance store. This is the ONLY place a balance changes.
 *
 * Money is adversarial in a way XP is not: XP that is double-counted is a
 * cosmetic bug, a balance that goes negative is an exploit. Two /pay commands
 * fired at once, or a shop button spam-clicked, must never let someone spend
 * what they do not have. So no debit here is ever a read-then-write. Every one
 * is a conditional `updateMany` with an `amount: { gte: n }` guard, and the
 * caller learns whether it took from the returned row count, which is what the
 * database itself decided under the row lock.
 *
 * Credits do not need the guard (a balance can only go up), but they still go
 * through an atomic `increment` so two payouts landing together cannot clobber
 * each other.
 *
 * Every mutation writes an EcoTransaction row. Staff asking "where did that
 * money come from" must have an answer that is not a guess, and the ledger is
 * the only thing that can give one after the fact.
 */

/** Machine-readable bucket for EcoTransaction.kind. */
export type EcoKind =
  | "message"
  | "voice"
  | "daily"
  | "pay"
  | "pay_tax"
  | "shop"
  | "refund"
  | "contest"
  | "giveaway"
  | "gamble"
  | "admin";

export interface BalanceRow {
  amount: bigint;
  lifetime: bigint;
  lastDailyAt: Date | null;
  dailyStreak: number;
  lastEarnAt: Date | null;
}

const ZERO: BalanceRow = {
  amount: 0n,
  lifetime: 0n,
  lastDailyAt: null,
  dailyStreak: 0,
  lastEarnAt: null,
};

/**
 * Read a balance, creating the row on first sight so `startingBalance` is
 * granted exactly once.
 *
 * The insert is a `createMany({ skipDuplicates: true })` rather than a
 * find-then-create: two commands run at the same moment by a brand-new member
 * would otherwise both see "no row" and both try to insert, and the loser would
 * throw on the unique constraint. skipDuplicates makes the loser a no-op, and
 * its returned count is what tells us whether THIS call created the row, so the
 * starting balance is ledgered exactly once.
 */
export async function getBalance(
  guildId: string,
  userId: string,
  startingBalance = 0,
): Promise<BalanceRow> {
  const existing = await prisma.balance.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: {
      amount: true,
      lifetime: true,
      lastDailyAt: true,
      dailyStreak: true,
      lastEarnAt: true,
    },
  });
  if (existing) return existing;

  // No row yet. If there is nothing to grant, do not create one: an empty row
  // per member who merely ran /balance would bloat the table and pad the
  // leaderboard with zeroes.
  if (startingBalance <= 0) return { ...ZERO };

  const start = BigInt(Math.floor(startingBalance));
  const inserted = await prisma.balance.createMany({
    data: [{ guildId, userId, amount: start, lifetime: start }],
    // A concurrent create won the race; leave their row untouched rather than
    // granting the starting balance a second time.
    skipDuplicates: true,
  });

  if (inserted.count > 0) {
    await ledger(guildId, userId, start, "Starting balance", "admin");
    return { ...ZERO, amount: start, lifetime: start };
  }

  const row = await prisma.balance.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: {
      amount: true,
      lifetime: true,
      lastDailyAt: true,
      dailyStreak: true,
      lastEarnAt: true,
    },
  });
  return row ?? { ...ZERO };
}

/** Write one ledger row. Never throws into a caller's happy path. */
async function ledger(
  guildId: string,
  userId: string,
  amount: bigint,
  reason: string,
  kind: EcoKind,
): Promise<void> {
  await prisma.ecoTransaction.create({
    data: { guildId, userId, amount, reason, kind: kind as string },
  });
}

/**
 * Credit a member and return their new balance.
 *
 * `lifetime` tracks only money that came from somewhere (earning, a daily, a
 * prize), which is what makes "richest of all time" meaningful and what stops
 * two members passing the same 1000 coins back and forth from inflating both
 * their totals forever. A transfer credit therefore passes countLifetime=false.
 */
export async function addCoins(
  guildId: string,
  userId: string,
  amount: number | bigint,
  reason: string,
  kind: EcoKind,
  countLifetime = true,
): Promise<bigint> {
  const delta = toPositive(amount);
  if (delta === 0n) {
    const row = await getBalance(guildId, userId);
    return row.amount;
  }

  const row = await prisma.balance.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: {
      guildId,
      userId,
      amount: delta,
      lifetime: countLifetime ? delta : 0n,
    },
    update: {
      amount: { increment: delta },
      ...(countLifetime ? { lifetime: { increment: delta } } : {}),
    },
    select: { amount: true },
  });

  await ledger(guildId, userId, delta, reason, kind);
  return row.amount;
}

/**
 * Debit a member. Returns false, and changes nothing, when they cannot afford
 * it.
 *
 * The whole point of this function: the `amount: { gte: delta }` in the WHERE
 * clause is evaluated by Postgres while it holds the row lock, so of two
 * concurrent spends against a balance that only covers one, exactly one gets
 * count 1 and the other gets count 0. A read-then-write here would let both
 * through and leave the balance negative.
 */
export async function removeCoins(
  guildId: string,
  userId: string,
  amount: number | bigint,
  reason: string,
  kind: EcoKind,
): Promise<boolean> {
  const delta = toPositive(amount);
  if (delta === 0n) return true;

  const result = await prisma.balance.updateMany({
    where: { guildId, userId, amount: { gte: delta } },
    data: { amount: { decrement: delta } },
  });

  if (result.count === 0) return false;

  await ledger(guildId, userId, -delta, reason, kind);
  return true;
}

/**
 * Move money between two members, optionally skimming a tax that is destroyed.
 *
 * Both legs run inside one transaction so the money cannot exist in neither
 * place (or both) if the process dies between them. The debit keeps its
 * conditional guard INSIDE the transaction, so a concurrent spend that lands
 * first simply makes this one fail its guard and roll the whole thing back
 * rather than overdrawing the sender.
 */
export interface TransferResult {
  ok: boolean;
  /** What actually landed in the recipient's balance, after tax. */
  received: bigint;
  tax: bigint;
}

export async function transfer(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number | bigint,
  taxPercent = 0,
): Promise<TransferResult> {
  const gross = toPositive(amount);
  if (gross === 0n) return { ok: false, received: 0n, tax: 0n };

  const pct = BigInt(Math.max(0, Math.min(100, Math.floor(taxPercent))));
  const tax = (gross * pct) / 100n;
  const net = gross - tax;

  try {
    await prisma.$transaction(async (tx) => {
      const debited = await tx.balance.updateMany({
        where: { guildId, userId: fromUserId, amount: { gte: gross } },
        data: { amount: { decrement: gross } },
      });
      // Throwing is what rolls the transaction back; a plain return would
      // commit the (empty) debit and then credit the recipient for free.
      if (debited.count === 0) throw new InsufficientFunds();

      await tx.balance.upsert({
        where: { guildId_userId: { guildId, userId: toUserId } },
        // A transfer is not earning, so it never touches `lifetime`; otherwise
        // two members could pass the same coins back and forth and both climb
        // the all-time list forever.
        create: { guildId, userId: toUserId, amount: net, lifetime: 0n },
        update: { amount: { increment: net } },
      });

      await tx.ecoTransaction.createMany({
        data: [
          {
            guildId,
            userId: fromUserId,
            amount: -gross,
            reason: `Paid <@${toUserId}>`,
            kind: "pay",
          },
          {
            guildId,
            userId: toUserId,
            amount: net,
            reason: `Received from <@${fromUserId}>`,
            kind: "pay",
          },
          ...(tax > 0n
            ? [
                {
                  guildId,
                  userId: fromUserId,
                  amount: 0n,
                  reason: `Transfer tax of ${tax} (${pct}%)`,
                  kind: "pay_tax",
                },
              ]
            : []),
        ],
      });
    });
  } catch (err) {
    if (err instanceof InsufficientFunds) {
      return { ok: false, received: 0n, tax: 0n };
    }
    throw err;
  }

  return { ok: true, received: net, tax };
}

/** Sentinel used to roll back a transfer whose debit guard failed. */
class InsufficientFunds extends Error {}

/**
 * Overwrite a balance outright (the /eco set path).
 *
 * Staff setting an exact number is the one legitimate read-then-write in this
 * file, because "set to N" has no meaningful concurrent semantics: whichever
 * staff command lands last wins, by definition. The delta is still computed and
 * ledgered so the audit trail shows the size of the correction.
 */
export async function setBalance(
  guildId: string,
  userId: string,
  amount: number | bigint,
  reason: string,
  actorId: string,
): Promise<bigint> {
  const next = toPositive(amount);

  const row = await prisma.balance.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, amount: next, lifetime: next },
    update: { amount: next },
    select: { amount: true },
  });

  await ledger(
    guildId,
    userId,
    next,
    `${reason} (set by <@${actorId}>)`,
    "admin",
  );
  return row.amount;
}

/**
 * Take up to `amount` from a member, flooring at zero (the /eco take path).
 *
 * Unlike removeCoins this never fails: staff taking 500 from someone holding
 * 200 means "take what they have", not "do nothing". Returns what was actually
 * taken. Still guard-free of a race, because the decrement is expressed as a
 * conditional on the exact amount and then retried against the true balance.
 */
export async function takeCoins(
  guildId: string,
  userId: string,
  amount: number | bigint,
  reason: string,
  actorId: string,
): Promise<bigint> {
  const want = toPositive(amount);
  if (want === 0n) return 0n;

  let taken = 0n;
  await prisma.$transaction(async (tx) => {
    const row = await tx.balance.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { amount: true },
    });
    const have = row?.amount ?? 0n;
    taken = want > have ? have : want;
    if (taken === 0n) return;

    await tx.balance.update({
      where: { guildId_userId: { guildId, userId } },
      data: { amount: { decrement: taken } },
    });
    await tx.ecoTransaction.create({
      data: {
        guildId,
        userId,
        amount: -taken,
        reason: `${reason} (by <@${actorId}>)`,
        kind: "admin",
      },
    });
  });

  return taken;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyResult {
  ok: boolean;
  /** Set when ok=false: when they may claim again. */
  nextClaimAt?: Date;
  amount: bigint;
  streak: number;
  balance: bigint;
}

/**
 * Claim the daily.
 *
 * The eligibility test is `lastDailyAt <= now - 24h`, evaluated by the database
 * inside the same UPDATE that stamps the new time. That is deliberate: a timer
 * or an in-memory cooldown map would both be wrong here (a restart forgets it,
 * and two /daily interactions racing would both pass an in-process check).
 * Because the guard and the write are one statement, exactly one of two
 * simultaneous claims can ever get count 1.
 *
 * The streak is computed from the SAME lastDailyAt: claiming inside the 48h
 * window after the last claim continues it, and anything later has missed a day
 * and starts again at 1.
 */
export async function claimDaily(
  guildId: string,
  userId: string,
  amount: number,
  streakBonus: number,
  streakCap: number,
): Promise<DailyResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - DAY_MS);

  const existing = await prisma.balance.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { lastDailyAt: true, dailyStreak: true, amount: true },
  });

  if (existing?.lastDailyAt && existing.lastDailyAt > cutoff) {
    return {
      ok: false,
      nextClaimAt: new Date(existing.lastDailyAt.getTime() + DAY_MS),
      amount: 0n,
      streak: existing.dailyStreak,
      balance: existing.amount,
    };
  }

  // Continued only if the previous claim was inside the last 48h. Missing a
  // whole day drops them back to day 1.
  const continued =
    existing?.lastDailyAt != null &&
    existing.lastDailyAt.getTime() > now.getTime() - 2 * DAY_MS;
  const streak = continued ? (existing?.dailyStreak ?? 0) + 1 : 1;

  // The bonus grows with the streak then holds flat at the cap, so day 30 of a
  // 7-day cap pays the same as day 7 rather than compounding without limit.
  const effectiveDays = Math.min(streak, Math.max(1, streakCap));
  const payout = BigInt(
    Math.max(0, Math.floor(amount)) +
      Math.max(0, Math.floor(streakBonus)) * (effectiveDays - 1),
  );

  if (!existing) {
    // First ever claim. skipDuplicates makes a concurrent create a no-op, and a
    // zero count means the other call is mid-claim, so this one backs off.
    const inserted = await prisma.balance.createMany({
      data: [
        {
          guildId,
          userId,
          amount: payout,
          lifetime: payout,
          lastDailyAt: now,
          dailyStreak: streak,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      return { ok: false, nextClaimAt: now, amount: 0n, streak: 0, balance: 0n };
    }
    await ledger(guildId, userId, payout, `Daily (day ${streak})`, "daily");
    return { ok: true, amount: payout, streak, balance: payout };
  }

  // The guard that makes this safe: only rows whose lastDailyAt is still older
  // than the cutoff are updated, so the second of two racing claims gets 0.
  const claimed = await prisma.balance.updateMany({
    where: {
      guildId,
      userId,
      OR: [{ lastDailyAt: null }, { lastDailyAt: { lte: cutoff } }],
    },
    data: {
      amount: { increment: payout },
      lifetime: { increment: payout },
      lastDailyAt: now,
      dailyStreak: streak,
    },
  });

  if (claimed.count === 0) {
    return {
      ok: false,
      nextClaimAt: new Date(now.getTime() + DAY_MS),
      amount: 0n,
      streak: existing.dailyStreak,
      balance: existing.amount,
    };
  }

  await ledger(guildId, userId, payout, `Daily (day ${streak})`, "daily");
  return {
    ok: true,
    amount: payout,
    streak,
    balance: existing.amount + payout,
  };
}

export interface TopRow {
  userId: string;
  amount: bigint;
  lifetime: bigint;
}

/** The richest members, highest balance first. Served by the (guildId, amount) index. */
export async function top(guildId: string, limit = 10): Promise<TopRow[]> {
  const rows = await prisma.balance.findMany({
    where: { guildId },
    orderBy: { amount: "desc" },
    take: Math.max(1, Math.min(100, limit)),
    select: { userId: true, amount: true, lifetime: true },
  });
  return rows;
}

/** One page of the richest list, plus the total number of ranked members. */
export async function topPage(
  guildId: string,
  page: number,
  perPage = 10,
): Promise<{ rows: TopRow[]; total: number; pages: number }> {
  const total = await prisma.balance.count({ where: { guildId } });
  const pages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), pages);

  const rows = await prisma.balance.findMany({
    where: { guildId },
    orderBy: { amount: "desc" },
    skip: (safePage - 1) * perPage,
    take: perPage,
    select: { userId: true, amount: true, lifetime: true },
  });

  return { rows, total, pages };
}

/** A member's 1-based position by balance, and how many members are ranked. */
export async function getRank(
  guildId: string,
  userId: string,
  amount: bigint,
): Promise<{ rank: number; total: number }> {
  const [ahead, total] = await Promise.all([
    prisma.balance.count({ where: { guildId, amount: { gt: amount } } }),
    prisma.balance.count({ where: { guildId } }),
  ]);
  return { rank: ahead + 1, total };
}

/** Coerce any caller's number into a non-negative BigInt of whole coins. */
function toPositive(amount: number | bigint): bigint {
  if (typeof amount === "bigint") return amount > 0n ? amount : 0n;
  if (!Number.isFinite(amount)) return 0n;
  const floored = Math.floor(amount);
  return floored > 0 ? BigInt(floored) : 0n;
}
