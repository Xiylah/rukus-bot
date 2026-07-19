import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { prisma } from "@rukus/db";
import type { ShopConfig, ShopItem, ShopItemKind } from "@rukus/shared";
import { log } from "../../lib/logger.js";
import { addTempRole } from "../roles/state.js";
import { credit, debit } from "./economy.js";

/**
 * The shop: turning currency into things.
 *
 * The ordering in `purchase` is the load-bearing part. Every cheap check runs
 * first, then the debit, then the effect. The debit is the point of no return,
 * so anything that can fail for a boring reason (item disabled, wrong role, out
 * of stock) must be settled BEFORE it, and anything that can still fail after it
 * must refund. Taking someone's coins and handing back nothing is the worst bug
 * this feature can have.
 */

export const SHOP_BUY_CID = "shop:buy";
export const SHOP_PAGE_CID = "shop:page";
export const SHOP_FULFIL_CID = "shop:fulfil";

export const PURCHASE_STATUS = {
  complete: "COMPLETE",
  pending: "PENDING",
  refunded: "REFUNDED",
} as const;

export type PurchaseFailure =
  | "disabled"
  | "unknown_item"
  | "item_disabled"
  | "out_of_stock"
  | "limit_reached"
  | "missing_role"
  | "insufficient_funds"
  | "role_unavailable"
  | "grant_failed";

export type PurchaseResult =
  | { ok: true; item: ShopItem; purchaseId: string; pending: boolean }
  | { ok: false; reason: PurchaseFailure; item?: ShopItem };

/** Find an item by its id, or failing that by a case-insensitive name match. */
export function findItem(
  config: ShopConfig,
  query: string,
): ShopItem | undefined {
  const needle = query.trim().toLowerCase();
  return (
    config.items.find((i) => i.id === query) ??
    config.items.find((i) => i.name.toLowerCase() === needle)
  );
}

/** How many of this item the member has already bought (refunds don't count). */
export async function purchasedCount(
  guildId: string,
  userId: string,
  itemId: string,
): Promise<number> {
  return prisma.purchase.count({
    where: {
      guildId,
      userId,
      itemId,
      status: { in: [PURCHASE_STATUS.complete, PURCHASE_STATUS.pending] },
    },
  });
}

/** How many have been sold in total, for the stock limit. */
async function soldCount(guildId: string, itemId: string): Promise<number> {
  return prisma.purchase.count({
    where: {
      guildId,
      itemId,
      status: { in: [PURCHASE_STATUS.complete, PURCHASE_STATUS.pending] },
    },
  });
}

/** Stock remaining, or null when the item is unlimited. */
export async function stockLeft(
  guildId: string,
  item: ShopItem,
): Promise<number | null> {
  if (item.stock === 0) return null;
  return Math.max(0, item.stock - (await soldCount(guildId, item.id)));
}

/**
 * Buy an item.
 *
 * `member` is required because three of the checks (required roles, role
 * hierarchy, granting the role) are all about the guild member, not just an id.
 */
export async function purchase(
  guildId: string,
  member: GuildMember,
  itemId: string,
  config: ShopConfig,
): Promise<PurchaseResult> {
  if (!config.enabled) return { ok: false, reason: "disabled" };

  const item = findItem(config, itemId);
  if (!item) return { ok: false, reason: "unknown_item" };
  if (!item.enabled) return { ok: false, reason: "item_disabled", item };

  const userId = member.id;

  if (
    item.requiredRoleIds.length > 0 &&
    !item.requiredRoleIds.some((r) => member.roles.cache.has(r))
  ) {
    return { ok: false, reason: "missing_role", item };
  }

  if (item.perUserLimit > 0) {
    const mine = await purchasedCount(guildId, userId, item.id);
    if (mine >= item.perUserLimit) {
      return { ok: false, reason: "limit_reached", item };
    }
  }

  const left = await stockLeft(guildId, item);
  if (left !== null && left <= 0) {
    return { ok: false, reason: "out_of_stock", item };
  }

  // A role we cannot hand over is caught BEFORE the debit rather than refunded
  // after it. A refund is a correct outcome but a visibly ugly one ("you were
  // charged, then given your money back"), so it is the fallback, not the plan.
  if (item.kind === "role") {
    if (!item.roleId) return { ok: false, reason: "role_unavailable", item };
    if (!canGrantRole(member.guild, item.roleId)) {
      return { ok: false, reason: "role_unavailable", item };
    }
  }

  const price = BigInt(item.price);
  const paid = await debit(guildId, userId, price, `Bought ${item.name}`);
  if (!paid) return { ok: false, reason: "insufficient_funds", item };

  // ---- Past the point of no return: they have paid. ----

  const pending = item.kind === "custom";
  let purchaseRow;
  try {
    purchaseRow = await prisma.purchase.create({
      data: {
        guildId,
        userId,
        itemId: item.id,
        itemName: item.name,
        price,
        status: pending ? PURCHASE_STATUS.pending : PURCHASE_STATUS.complete,
      },
    });
  } catch (err) {
    log.error(`Purchase row write failed for ${userId}: ${String(err)}`);
    await credit(guildId, userId, price, `Refund: ${item.name}`);
    return { ok: false, reason: "grant_failed", item };
  }

  const applied = await applyEffect(guildId, member, item);
  if (!applied) {
    await credit(guildId, userId, price, `Refund: ${item.name}`);
    await prisma.purchase
      .update({
        where: { id: purchaseRow.id },
        data: { status: PURCHASE_STATUS.refunded },
      })
      .catch((e: unknown) =>
        log.warn(`Marking purchase refunded failed: ${String(e)}`),
      );
    return { ok: false, reason: "grant_failed", item };
  }

  return { ok: true, item, purchaseId: purchaseRow.id, pending };
}

/**
 * Can the bot actually hand this role over?
 *
 * Discord refuses to grant a role at or above the bot's own top role, and the
 * error arrives only at grant time, which would be after the member has paid.
 */
function canGrantRole(guild: Guild, roleId: string): boolean {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
  const role = guild.roles.cache.get(roleId);
  if (!role || role.managed) return false;
  return me.roles.highest.comparePositionTo(role) > 0;
}

/** Do the thing the item promises. False means "refund them". */
async function applyEffect(
  guildId: string,
  member: GuildMember,
  item: ShopItem,
): Promise<boolean> {
  switch (item.kind) {
    case "role":
      return grantRole(guildId, member, item);
    case "xpboost":
      return grantBoost(guildId, member.id, item);
    // The Purchase row IS the grant for these: extraEntriesFor reads it back.
    case "contest_entry":
    case "giveaway_entry":
      return true;
    // Staff fulfil it by hand; the row sits at PENDING until they do.
    case "custom":
      return true;
    default:
      return true;
  }
}

async function grantRole(
  guildId: string,
  member: GuildMember,
  item: ShopItem,
): Promise<boolean> {
  if (!item.roleId) return false;
  try {
    await member.roles.add(item.roleId, `Shop purchase: ${item.name}`);
  } catch (err) {
    log.warn(`Shop role grant failed for ${member.id}: ${String(err)}`);
    return false;
  }

  if (item.roleDurationHours > 0) {
    // Reuses /temprole's state + sweeper rather than adding a second expiry
    // system. One sweeper that already survives a redeploy beats two that
    // disagree about who owns the removal.
    try {
      await addTempRole(guildId, {
        userId: member.id,
        roleId: item.roleId,
        expiresAt: Date.now() + item.roleDurationHours * 3_600_000,
        moderatorId: member.client.user.id,
      });
    } catch (err) {
      // They have the role; we just failed to schedule its removal. Keeping the
      // role they paid for is strictly better than refunding and yanking it.
      log.error(
        `Temp-role expiry not scheduled for ${member.id} (${item.roleId}): ${String(err)}`,
      );
    }
  }
  return true;
}

async function grantBoost(
  guildId: string,
  userId: string,
  item: ShopItem,
): Promise<boolean> {
  try {
    await prisma.activeBoost.create({
      data: {
        guildId,
        userId,
        multiplier: item.boostMultiplier,
        expiresAt: new Date(Date.now() + item.boostHours * 3_600_000),
      },
    });
    invalidateBoost(guildId, userId);
    return true;
  } catch (err) {
    log.warn(`Boost grant failed for ${userId}: ${String(err)}`);
    return false;
  }
}

// ---------------- Active boosts ----------------

/**
 * Short-lived cache for activeMultiplier.
 *
 * The XP and currency earn paths call this on EVERY message, so an uncached
 * read would add a query per message per member. Five seconds is long enough to
 * absorb a burst and short enough that a just-bought boost feels instant.
 *
 * House rule 3: bounded. The bot is public, so a per-member key would grow
 * without limit across every guild we serve; MAX_BOOST_KEYS caps it and the
 * oldest entry is dropped on overflow.
 */
const MAX_BOOST_KEYS = 5000;
const BOOST_TTL_MS = 5_000;
const boostCache = new Map<string, { value: number; at: number }>();

function invalidateBoost(guildId: string, userId: string): void {
  boostCache.delete(`${guildId}:${userId}`);
}

/**
 * The member's current XP/currency multiplier, 1 when they have no boost.
 *
 * Stacked boosts take the HIGHEST rather than the product: someone who buys
 * three 2x boosts gets 2x, not 8x. Multiplying them would let a member with a
 * large balance mint an absurd rate, which is the sort of thing that quietly
 * ruins a levelling curve.
 */
export async function activeMultiplier(
  guildId: string,
  userId: string,
): Promise<number> {
  const key = `${guildId}:${userId}`;
  const hit = boostCache.get(key);
  if (hit && Date.now() - hit.at < BOOST_TTL_MS) return hit.value;

  let value = 1;
  try {
    const boosts = await prisma.activeBoost.findMany({
      where: { guildId, userId, expiresAt: { gt: new Date() } },
      select: { multiplier: true },
    });
    for (const b of boosts) value = Math.max(value, b.multiplier);
  } catch (err) {
    log.warn(`Boost lookup failed for ${userId}: ${String(err)}`);
    return 1;
  }

  if (boostCache.size >= MAX_BOOST_KEYS) {
    const oldest = boostCache.keys().next().value;
    if (oldest !== undefined) boostCache.delete(oldest);
  }
  boostCache.set(key, { value, at: Date.now() });
  return value;
}

/** Every live boost for a member, for /inventory's "time left" display. */
export async function activeBoosts(guildId: string, userId: string) {
  return prisma.activeBoost.findMany({
    where: { guildId, userId, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "asc" },
  });
}

// ---------------- Extra entries ----------------

/**
 * Bonus contest/giveaway entries this member has bought.
 *
 * Read from Purchase rows rather than a counter column so the contest and
 * giveaway code can call this without the shop having to push state at them,
 * and so a refund automatically removes the entries it paid for.
 */
export async function extraEntriesFor(
  guildId: string,
  userId: string,
  kind: Extract<ShopItemKind, "contest_entry" | "giveaway_entry">,
  config: ShopConfig,
): Promise<number> {
  const itemIds = config.items
    .filter((i) => i.kind === kind)
    .map((i) => i.id);
  if (itemIds.length === 0) return 0;

  const rows = await prisma.purchase.findMany({
    where: {
      guildId,
      userId,
      itemId: { in: itemIds },
      status: PURCHASE_STATUS.complete,
    },
    select: { itemId: true },
  });

  let total = 0;
  for (const row of rows) {
    const item = config.items.find((i) => i.id === row.itemId);
    total += item?.extraEntries ?? 0;
  }
  return total;
}

// ---------------- Custom-order fulfilment ----------------

/** Announce a custom order so staff know there is something to do. */
export async function postFulfilRequest(
  guild: Guild,
  config: ShopConfig,
  member: GuildMember,
  item: ShopItem,
  purchaseId: string,
): Promise<void> {
  if (!config.fulfilChannelId) return;
  const channel = await guild.channels
    .fetch(config.fulfilChannelId)
    .catch(() => null);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle("🧾 Order to fulfil")
    .setColor(0xfaa61a)
    .setDescription(item.description || null)
    .addFields(
      { name: "Item", value: item.name, inline: true },
      { name: "Price", value: String(item.price), inline: true },
      { name: "Buyer", value: `<@${member.id}>`, inline: true },
      { name: "Order id", value: `\`${purchaseId}\`` },
    )
    .setFooter({ text: `Mark it done with /shop fulfil ${purchaseId}` })
    .setTimestamp();

  await (channel as TextChannel)
    .send({ embeds: [embed], allowedMentions: { parse: [] } })
    .catch((e) => log.warn(`Fulfil post failed: ${String(e)}`));
}

/** Staff marking a custom order done. Null when there is nothing to fulfil. */
export async function fulfilPurchase(
  guildId: string,
  purchaseId: string,
): Promise<{ itemName: string; userId: string } | null> {
  // Guarded on the current status so two staff hitting it at once cannot both
  // "fulfil" the same order and post two confirmations.
  const result = await prisma.purchase.updateMany({
    where: { id: purchaseId, guildId, status: PURCHASE_STATUS.pending },
    data: { status: PURCHASE_STATUS.complete },
  });
  if (result.count === 0) return null;

  const row = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  return row ? { itemName: row.itemName, userId: row.userId } : null;
}

/** Write a line to the shop log channel, if one is configured. */
export async function logPurchase(
  guild: Guild,
  config: ShopConfig,
  member: GuildMember,
  item: ShopItem,
  purchaseId: string,
): Promise<void> {
  if (!config.logChannelId) return;
  const channel = await guild.channels
    .fetch(config.logChannelId)
    .catch(() => null);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({
      name: member.user.tag,
      iconURL: member.displayAvatarURL(),
    })
    .setDescription(
      `Bought **${item.name}** for **${item.price}**\n\`${purchaseId}\``,
    )
    .setTimestamp();

  await (channel as TextChannel)
    .send({ embeds: [embed], allowedMentions: { parse: [] } })
    .catch((e) => log.warn(`Shop log post failed: ${String(e)}`));
}
