import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type OverwriteResolvable,
} from "discord.js";
import { prisma } from "@rukus/db";
import type { TicketConfig, TicketType } from "@rukus/shared";

/**
 * Ticket domain operations. These functions own the DB rows and the Discord
 * channel side effects; interaction handlers call them and deal only with
 * replying to the user.
 */

/** Reserve the next sequential ticket number for a guild, atomically. */
export async function nextTicketNumber(guildId: string): Promise<number> {
  // upsert-then-increment in a transaction avoids a race between two opens.
  const counter = await prisma.$transaction(async (tx) => {
    const row = await tx.ticketCounter.upsert({
      where: { guildId },
      create: { guildId, next: 2 },
      update: { next: { increment: 1 } },
    });
    // On create we set next=2 and hand out 1; on update we handed out (next-1).
    return row.next - 1;
  });
  return counter;
}

/** How many OPEN/CLAIMED tickets a user currently has in this guild. */
export function countOpenForUser(guildId: string, userId: string) {
  return prisma.ticket.count({
    where: { guildId, openerId: userId, status: { in: ["OPEN", "CLAIMED"] } },
  });
}

/**
 * Render a ticket type's channel-name template.
 * {count} → zero-padded per-guild ticket number, {type} → the type label.
 * The result is normalized to something Discord accepts as a channel name.
 */
export function renderChannelName(
  template: string,
  number: number,
  label: string,
): string {
  const raw = template
    .replace(/\{count\}/gi, String(number).padStart(4, "0"))
    .replace(/\{type\}/gi, label);
  const name = raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[^\p{L}\p{N}\p{Extended_Pictographic}_-]/gu, "")
    .slice(0, 100);
  return name || `ticket-${String(number).padStart(4, "0")}`;
}

/**
 * Every role that counts as ticket staff: the global support roles plus any
 * per-type overrides. Used for claim/close/manage permission checks, since at
 * check time we only know the channel, not always the type.
 */
export function allSupportRoleIds(config: TicketConfig): string[] {
  const ids = new Set(config.supportRoleIds);
  for (const t of config.types) for (const r of t.supportRoleIds) ids.add(r);
  return [...ids];
}

/** Create the private ticket channel and its DB row. Returns both. */
export async function createTicket(params: {
  guild: Guild;
  opener: GuildMember;
  config: TicketConfig;
  type: TicketType;
}) {
  const { guild, opener, config, type } = params;
  const number = await nextTicketNumber(guild.id);

  // Per-type support roles win when set; otherwise the global list.
  const supportRoleIds =
    type.supportRoleIds.length > 0 ? type.supportRoleIds : config.supportRoleIds;

  // Permission overwrites: hide from @everyone, allow opener + support roles.
  const overwrites: OverwriteResolvable[] = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: opener.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    ...supportRoleIds.map((id) => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    })),
  ];

  const channel = await guild.channels.create({
    name: renderChannelName(type.nameTemplate, number, type.label),
    type: ChannelType.GuildText,
    // Per-type category wins; otherwise the guild-level default.
    parent: type.categoryId ?? config.categoryId ?? undefined,
    topic: `${type.label} #${number} • opened by ${opener.user.tag} (${opener.id})`,
    permissionOverwrites: overwrites,
  });

  const ticket = await prisma.ticket.create({
    data: {
      guildId: guild.id,
      number,
      channelId: channel.id,
      openerId: opener.id,
      // The type label doubles as the subject, so staff tooling shows it.
      subject: type.label,
      typeId: type.id,
      status: "OPEN",
    },
  });

  return { ticket, channel };
}

export function getTicketByChannel(channelId: string) {
  return prisma.ticket.findUnique({ where: { channelId } });
}

export function claimTicket(channelId: string, staffId: string) {
  return prisma.ticket.update({
    where: { channelId },
    data: { status: "CLAIMED", claimedBy: staffId },
  });
}

export function markClosed(channelId: string, transcriptUrl?: string) {
  return prisma.ticket.update({
    where: { channelId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      transcriptUrl: transcriptUrl ?? undefined,
    },
  });
}
