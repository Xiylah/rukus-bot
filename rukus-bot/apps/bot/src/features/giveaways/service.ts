import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type TextChannel,
  type User,
} from "discord.js";
import { prisma, type Giveaway } from "@rukus/db";
import { COLORS } from "@rukus/shared";
import type { GiveawaysConfig } from "@rukus/shared";

/**
 * Giveaway domain logic: the entry surface, the embed, and picking winners.
 *
 * Entry is a BUTTON, not a reaction. A reaction-based giveaway silently loses
 * entrants when someone unreacts by accident and gives us no way to check the
 * required role before they are counted; a button lets us validate on press and
 * tell them why they were rejected.
 */

/** Custom-id namespace for the Enter button. Format: `gw:enter:<giveawayId>`. */
export const GIVEAWAY_ENTER_CID = "gw:enter";

/** Longest giveaway we accept, so a typo can't schedule one for the year 3000. */
const MAX_DURATION_MS = 90 * 24 * 3_600_000;

const UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parse a human duration like "30m", "2h30m", "1d". Returns null when the input
 * is unparseable or out of range, so the caller can show one clear error.
 */
export function parseDuration(input: string): number | null {
  const matches = [...input.toLowerCase().matchAll(/(\d+)\s*([smhdw])/g)];
  if (matches.length === 0) return null;
  let total = 0;
  for (const [, amount, unit] of matches) {
    total += Number(amount) * UNITS[unit!]!;
  }
  if (total <= 0 || total > MAX_DURATION_MS) return null;
  return total;
}

/**
 * Pick n distinct winners uniformly at random. Exported and pure so the same
 * function serves both the initial draw and a reroll, and so it is testable.
 * Fewer entrants than winner slots is not an error: everyone wins.
 */
export function pickWinners(
  entrants: string[],
  count: number,
  exclude: string[] = [],
): string[] {
  const pool = entrants.filter((id) => !exclude.includes(id));
  // Fisher-Yates on a copy, so we never mutate the caller's array.
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function giveawayEmbed(
  giveaway: Pick<
    Giveaway,
    "prize" | "winnerCount" | "endsAt" | "hostId" | "requiredRoleId" | "entrantIds" | "ended" | "winnerIds"
  >,
  config: GiveawaysConfig,
  /** id -> display name, so the ended panel reads on mobile. The winners were
   *  already fetched to be DMed, so passing this in costs nothing extra. */
  winnerNames?: Map<string, string>,
): EmbedBuilder {
  const endsUnix = Math.floor(giveaway.endsAt.getTime() / 1000);
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setColor(
      giveaway.ended
        ? COLORS.neutral
        : Number.parseInt(config.embedColor.slice(1), 16),
    );

  if (giveaway.ended) {
    const winner = (id: string) => {
      const name = winnerNames?.get(id);
      return name ? `<@${id}> (${name})` : `<@${id}>`;
    };
    embed.setDescription(
      giveaway.winnerIds.length > 0
        ? `Winner(s): ${giveaway.winnerIds.map(winner).join(", ")}`
        : "Ended with no valid entries.",
    );
    embed.addFields(
      { name: "Entries", value: String(giveaway.entrantIds.length), inline: true },
      { name: "Ended", value: `<t:${endsUnix}:R>`, inline: true },
    );
  } else {
    embed.setDescription("Press **Enter** below to join.");
    embed.addFields(
      { name: "Ends", value: `<t:${endsUnix}:R>`, inline: true },
      { name: "Winners", value: String(giveaway.winnerCount), inline: true },
      { name: "Entries", value: String(giveaway.entrantIds.length), inline: true },
    );
    if (giveaway.requiredRoleId) {
      embed.addFields({
        name: "Requirement",
        value: `<@&${giveaway.requiredRoleId}>`,
      });
    }
  }

  embed.addFields({ name: "Host", value: `<@${giveaway.hostId}>`, inline: true });
  return embed;
}

/** The Enter button row. Disabled once the giveaway has ended. */
export function giveawayComponents(giveaway: Pick<Giveaway, "id" | "ended" | "entrantIds">, config: GiveawaysConfig) {
  const button = new ButtonBuilder()
    .setCustomId(`${GIVEAWAY_ENTER_CID}:${giveaway.id}`)
    .setLabel(
      giveaway.ended
        ? `Ended (${giveaway.entrantIds.length} entries)`
        : `Enter (${giveaway.entrantIds.length})`,
    )
    .setEmoji(config.emoji)
    .setStyle(giveaway.ended ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setDisabled(giveaway.ended);

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(button)];
}

/**
 * Re-render a giveaway's message from its current row. Used after an entry, an
 * end, and a reroll, so the message is never a stale view of the database.
 */
export async function refreshGiveawayMessage(
  guild: Guild,
  giveaway: Giveaway,
  config: GiveawaysConfig,
  winnerNames?: Map<string, string>,
): Promise<boolean> {
  const channel =
    guild.channels.cache.get(giveaway.channelId) ??
    (await guild.channels.fetch(giveaway.channelId).catch(() => null));
  if (!channel?.isTextBased()) return false;

  const message = await (channel as TextChannel).messages
    .fetch(giveaway.messageId)
    .catch(() => null);
  if (!message) return false;

  await message.edit({
    embeds: [giveawayEmbed(giveaway, config, winnerNames)],
    components: giveawayComponents(giveaway, config),
  });
  return true;
}

/**
 * Draw winners, mark the giveaway ended, announce, and optionally DM.
 *
 * Returns null when the giveaway was already ended by someone else. The sweeper
 * and a manual `/giveaway end` can fire on the same row at the same moment, and
 * only one of them may announce winners, so the transition to ended is done as
 * a conditional write and losing that write means backing out silently. A
 * reroll is exempt: it is deliberately acting on an already-ended giveaway.
 */
export async function endGiveaway(
  guild: Guild,
  giveaway: Giveaway,
  config: GiveawaysConfig,
  options: { reroll?: boolean } = {},
): Promise<{ winners: string[] } | null> {
  // A reroll must not hand the prize to someone who already won it.
  const exclude = options.reroll ? giveaway.winnerIds : [];
  const winners = pickWinners(giveaway.entrantIds, giveaway.winnerCount, exclude);

  if (!options.reroll) {
    const claimed = await prisma.giveaway.updateMany({
      where: { id: giveaway.id, ended: false },
      data: { ended: true, winnerIds: winners },
    });
    if (claimed.count === 0) return null;
  } else {
    await prisma.giveaway.update({
      where: { id: giveaway.id },
      // A reroll replaces the winner list, so the message always shows who
      // currently holds the prize.
      data: { winnerIds: winners },
    });
  }

  const updated = await prisma.giveaway.findUniqueOrThrow({
    where: { id: giveaway.id },
  });

  // Resolve winner names once, so the ended panel reads on mobile. Reused below
  // for the DMs, so nobody is fetched twice.
  const winnerNames = new Map<string, string>();
  const winnerUsers = new Map<string, User>();
  for (const id of winners) {
    const user = await guild.client.users.fetch(id).catch(() => null);
    if (user) {
      winnerNames.set(id, user.globalName ?? user.username);
      winnerUsers.set(id, user);
    }
  }

  await refreshGiveawayMessage(guild, updated, config, winnerNames);

  const channel =
    guild.channels.cache.get(giveaway.channelId) ??
    (await guild.channels.fetch(giveaway.channelId).catch(() => null));

  if (channel?.isTextBased()) {
    const link = `https://discord.com/channels/${guild.id}/${giveaway.channelId}/${giveaway.messageId}`;
    const mentions = winners.map((id) => `<@${id}>`).join(", ");
    const announce = config.announceMessage
      .replaceAll("{winners}", mentions)
      .replaceAll("{prize}", giveaway.prize);
    const text =
      winners.length === 0
        ? `🎉 Nobody entered the giveaway for **${giveaway.prize}**, so there is no winner. ${link}`
        : `${options.reroll ? `🎉 Rerolled ${mentions}, you won **${giveaway.prize}**!` : announce} ${link}`;
    // allowedMentions stays locked to users so a template with @everyone/@here
    // cannot turn a win announcement into a mass ping.
    await (channel as TextChannel)
      .send({ content: text, allowedMentions: { parse: ["users"] } })
      .catch(() => {});
  }

  if (config.dmWinners) {
    for (const id of winners) {
      // Reuse the user we already fetched for the panel names; no second fetch.
      const user = winnerUsers.get(id);
      await user
        ?.send(
          `🎉 You won **${giveaway.prize}** in **${guild.name}**! ` +
            "Get in touch with the host to claim it.",
        )
        .catch(() => {});
    }
  }

  return { winners };
}
