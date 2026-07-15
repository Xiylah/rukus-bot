import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { prisma } from "@rukus/db";
import { COLORS } from "@rukus/shared";
import {
  getCase,
  deleteCase,
  formatMinutes,
  ACTION_STYLE,
} from "../features/moderation/cases.js";
import { resolvedMention } from "../lib/mentions.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("Look up or remove moderation cases")
    // Deleting records is an admin-level action, not a general mod one.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("Show a single case")
        .addIntegerOption((o) =>
          o
            .setName("number")
            .setDescription("The case number")
            .setMinValue(1)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Permanently delete one case (e.g. a test case)")
        .addIntegerOption((o) =>
          o
            .setName("number")
            .setDescription("The case number")
            .setMinValue(1)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("clear")
        .setDescription("Delete a range of cases, or every case for one member")
        .addUserOption((o) =>
          o.setName("user").setDescription("Delete all cases for this member"),
        )
        .addIntegerOption((o) =>
          o
            .setName("from")
            .setDescription("Delete cases from this number...")
            .setMinValue(1),
        )
        .addIntegerOption((o) =>
          o
            .setName("to")
            .setDescription("...up to this number (inclusive)")
            .setMinValue(1),
        )
        .addBooleanOption((o) =>
          o
            .setName("reset_numbering")
            .setDescription(
              "Also reset the counter so the next case starts at #0001 (only when clearing everything)",
            ),
        )
        .addBooleanOption((o) =>
          o
            .setName("confirm")
            .setDescription("Required: this permanently deletes case records"),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "view") {
      const number = interaction.options.getInteger("number", true);
      const c = await getCase(guildId, number);
      if (!c) {
        await interaction.reply({ content: `No case #${number}.`, ...ephemeral });
        return;
      }
      const style = ACTION_STYLE[c.action];
      const base = process.env.DASHBOARD_URL?.replace(/\/+$/, "");
      const embed = new EmbedBuilder()
        .setColor(style.color)
        .setTitle(
          `${style.emoji} ${c.action} | Case #${String(c.number).padStart(4, "0")}`,
        )
        .addFields(
          { name: "Member", value: `<@${c.userId}> (${c.userTag ?? "?"})`, inline: true },
          {
            name: "Moderator",
            value: await resolvedMention(interaction.guild, c.moderatorId),
            inline: true,
          },
          ...(c.durationMin
            ? [{ name: "Duration", value: formatMinutes(c.durationMin), inline: true }]
            : []),
          { name: "Reason", value: c.reason || "No reason provided" },
          {
            name: "When",
            value: `<t:${Math.floor(c.createdAt.getTime() / 1000)}:F>`,
          },
        );
      if (c.proofToken && base) {
        embed.setImage(`${base}/proof/${c.proofToken}`);
      }
      await interaction.reply({ embeds: [embed], ...ephemeral });
      return;
    }

    if (sub === "delete") {
      const number = interaction.options.getInteger("number", true);
      const c = await getCase(guildId, number);
      if (!c) {
        await interaction.reply({ content: `No case #${number}.`, ...ephemeral });
        return;
      }
      await deleteCase(guildId, number);
      await interaction.reply({
        content:
          `🗑️ Deleted case #${String(number).padStart(4, "0")} ` +
          `(${c.action} on ${c.userTag ?? c.userId}).`,
        ...ephemeral,
      });
      return;
    }

    // ---- clear ----
    const user = interaction.options.getUser("user");
    const from = interaction.options.getInteger("from");
    const to = interaction.options.getInteger("to");
    const confirm = interaction.options.getBoolean("confirm") ?? false;
    const resetNumbering =
      interaction.options.getBoolean("reset_numbering") ?? false;

    const where: {
      guildId: string;
      userId?: string;
      number?: { gte?: number; lte?: number };
    } = { guildId };
    if (user) where.userId = user.id;
    if (from !== null || to !== null) {
      where.number = {};
      if (from !== null) where.number.gte = from;
      if (to !== null) where.number.lte = to;
    }

    const count = await prisma.modCase.count({ where });
    if (count === 0) {
      await interaction.reply({
        content: "No cases match that filter.",
        ...ephemeral,
      });
      return;
    }

    const scope = user
      ? `all ${count} case(s) for ${user.tag}`
      : from !== null || to !== null
        ? `${count} case(s) in range ${from ?? "start"}-${to ?? "end"}`
        : `ALL ${count} case(s) in this server`;

    if (!confirm) {
      await interaction.reply({
        content:
          `⚠️ This would permanently delete **${scope}**.\n` +
          "Run it again with `confirm: True` if you're sure.",
        ...ephemeral,
      });
      return;
    }

    await prisma.modCase.deleteMany({ where });

    // Only reset numbering when the whole log was wiped, or the next case
    // would collide with a surviving one.
    let note = "";
    const remaining = await prisma.modCase.count({ where: { guildId } });
    if (resetNumbering && remaining === 0) {
      await prisma.caseCounter.deleteMany({ where: { guildId } });
      note = " Numbering reset: the next case will be #0001.";
    } else if (resetNumbering) {
      note = ` Numbering NOT reset: ${remaining} case(s) still exist.`;
    }

    await interaction.reply({
      content: `🗑️ Deleted ${scope}.${note}`,
      ...ephemeral,
    });
  },
};

export default command;
