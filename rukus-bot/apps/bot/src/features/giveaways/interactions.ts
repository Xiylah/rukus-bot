import { MessageFlags, type ButtonInteraction } from "discord.js";
import { prisma } from "@rukus/db";
import { giveawaysConfig } from "../../lib/configCache.js";
import { refreshGiveawayMessage } from "./service.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/**
 * The Enter button. Custom id is `gw:enter:<giveawayId>`.
 *
 * Pressing again leaves the giveaway, which is what people expect from a
 * toggle-shaped button and saves us a second "Leave" button.
 */
export async function handleEnterButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const giveawayId = interaction.customId.split(":")[2];
  if (!giveawayId) return;

  const giveaway = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
  if (!giveaway) {
    await interaction.reply({
      content: "That giveaway no longer exists.",
      ...ephemeral,
    });
    return;
  }
  if (giveaway.ended) {
    await interaction.reply({
      content: "That giveaway has already ended.",
      ...ephemeral,
    });
    return;
  }

  if (
    giveaway.requiredRoleId &&
    !interaction.member.roles.cache.has(giveaway.requiredRoleId)
  ) {
    await interaction.reply({
      content: `You need <@&${giveaway.requiredRoleId}> to enter this giveaway.`,
      allowedMentions: { parse: [] },
      ...ephemeral,
    });
    return;
  }

  const userId = interaction.user.id;
  const leaving = giveaway.entrantIds.includes(userId);

  // Joining uses `push` rather than writing the array we just read, so two
  // people entering at the same instant cannot clobber each other's entry.
  // Leaving has to rewrite the array (Postgres has no atomic array-remove here),
  // but a duplicate concurrent leave is harmless: the id is already absent.
  const updated = await prisma.giveaway.update({
    where: { id: giveawayId },
    data: {
      entrantIds: leaving
        ? { set: giveaway.entrantIds.filter((id) => id !== userId) }
        : { push: userId },
    },
  });

  await interaction.reply({
    content: leaving
      ? "You left the giveaway. Press Enter again if you change your mind."
      : `🎉 You're in! ${updated.entrantIds.length} entr${
          updated.entrantIds.length === 1 ? "y" : "ies"
        } so far.`,
    ...ephemeral,
  });

  const config = await giveawaysConfig(interaction.guildId);
  await refreshGiveawayMessage(interaction.guild, updated, config);
}
