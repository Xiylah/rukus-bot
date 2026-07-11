import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type OverwriteResolvable,
} from "discord.js";
import { prisma } from "@rukus/db";
import type { TicketConfig } from "@rukus/shared";

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

/** Create the private ticket channel and its DB row. Returns both. */
export async function createTicket(params: {
  guild: Guild;
  opener: GuildMember;
  config: TicketConfig;
  subject?: string;
}) {
  const { guild, opener, config, subject } = params;
  const number = await nextTicketNumber(guild.id);

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
    ...config.supportRoleIds.map((id) => ({
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
    name: `ticket-${String(number).padStart(4, "0")}`,
    type: ChannelType.GuildText,
    parent: config.categoryId ?? undefined,
    topic: `Ticket #${number} • opened by ${opener.user.tag} (${opener.id})`,
    permissionOverwrites: overwrites,
  });

  const ticket = await prisma.ticket.create({
    data: {
      guildId: guild.id,
      number,
      channelId: channel.id,
      openerId: opener.id,
      subject: subject ?? null,
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
