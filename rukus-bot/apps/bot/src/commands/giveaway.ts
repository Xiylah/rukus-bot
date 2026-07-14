import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { prisma } from "@rukus/db";
import { giveawaysConfig } from "../lib/configCache.js";
import { canManageGuild, hasAnyRole } from "../lib/perms.js";
import {
  endGiveaway,
  giveawayComponents,
  giveawayEmbed,
  parseDuration,
} from "../features/giveaways/service.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Run a giveaway")
    // Not gated by default member permissions: hostRoleIds lets a server hand
    // giveaways to an events team that has no Manage Server. Each subcommand
    // checks in code.
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Start a giveaway in this channel")
        .addStringOption((o) =>
          o
            .setName("duration")
            .setDescription("How long it runs, e.g. 30m, 2h, 1d, 1w")
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("winners")
            .setDescription("How many winners to draw")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("prize")
            .setDescription("What they win")
            .setMaxLength(200)
            .setRequired(true),
        )
        .addRoleOption((o) =>
          o
            .setName("required_role")
            .setDescription("Only members with this role may enter"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("end")
        .setDescription("End a running giveaway now and draw the winners")
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("The giveaway id (shown when it was started)")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("reroll")
        .setDescription("Draw fresh winners for a giveaway that already ended")
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("The giveaway id (shown when it was started)")
            .setRequired(true),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await giveawaysConfig(interaction.guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "Giveaways aren't enabled on this server.",
        ...ephemeral,
      });
      return;
    }

    // Empty hostRoleIds means "Manage Server only", so an empty list must NOT
    // fall through to hasAnyRole (which would be vacuously false for admins
    // anyway, but this reads the intent explicitly).
    const member = interaction.member as GuildMember;
    const allowed =
      config.hostRoleIds.length > 0
        ? hasAnyRole(member, config.hostRoleIds) || canManageGuild(member)
        : canManageGuild(member);
    if (!allowed) {
      await interaction.reply({
        content: "You don't have permission to run giveaways here.",
        ...ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "start") {
      const durationMs = parseDuration(
        interaction.options.getString("duration", true),
      );
      if (durationMs === null) {
        await interaction.reply({
          content:
            "I couldn't read that duration. Use something like `30m`, `2h`, `1d`, or `1w` (max 90 days).",
          ...ephemeral,
        });
        return;
      }

      const winnerCount = interaction.options.getInteger("winners", true);
      const prize = interaction.options.getString("prize", true);
      const requiredRole = interaction.options.getRole("required_role");
      const channel = interaction.channel as TextChannel;

      await interaction.deferReply(ephemeral);

      const endsAt = new Date(Date.now() + durationMs);

      // The message id is required and unique on the row, but we only learn it
      // after posting, and the button's custom id needs the row id. So: create
      // with a placeholder message id, post, then backfill. The placeholder is
      // the interaction id, which is a snowflake and therefore never collides
      // with a real message id.
      const giveaway = await prisma.giveaway.create({
        data: {
          guildId: interaction.guildId,
          channelId: channel.id,
          messageId: interaction.id,
          hostId: interaction.user.id,
          prize,
          winnerCount,
          endsAt,
          requiredRoleId: requiredRole?.id ?? null,
          entrantIds: [],
          winnerIds: [],
        },
      });

      const message = await channel.send({
        embeds: [giveawayEmbed(giveaway, config)],
        components: giveawayComponents(giveaway, config),
      });

      await prisma.giveaway.update({
        where: { id: giveaway.id },
        data: { messageId: message.id },
      });

      await interaction.editReply({
        content:
          `🎉 Giveaway started for **${prize}**, ending <t:${Math.floor(
            endsAt.getTime() / 1000,
          )}:R>.\n` +
          `Id: \`${giveaway.id}\` (use it with \`/giveaway end\` or \`/giveaway reroll\`).`,
      });
      return;
    }

    const id = interaction.options.getString("id", true);
    const giveaway = await prisma.giveaway.findUnique({ where: { id } });
    if (!giveaway || giveaway.guildId !== interaction.guildId) {
      await interaction.reply({
        content: "No giveaway with that id on this server.",
        ...ephemeral,
      });
      return;
    }

    if (sub === "end") {
      if (giveaway.ended) {
        await interaction.reply({
          content: "That giveaway has already ended. Use `/giveaway reroll` instead.",
          ...ephemeral,
        });
        return;
      }
      await interaction.deferReply(ephemeral);
      const result = await endGiveaway(interaction.guild, giveaway, config);
      await interaction.editReply({
        content: !result
          ? "That giveaway ended a moment ago on its own."
          : result.winners.length === 0
            ? "Ended it. Nobody entered, so there is no winner."
            : `Ended it. Winner(s): ${result.winners.map((w) => `<@${w}>`).join(", ")}.`,
      });
      return;
    }

    if (sub === "reroll") {
      if (!giveaway.ended) {
        await interaction.reply({
          content: "That giveaway is still running. End it first.",
          ...ephemeral,
        });
        return;
      }
      await interaction.deferReply(ephemeral);
      const result = await endGiveaway(interaction.guild, giveaway, config, {
        reroll: true,
      });
      await interaction.editReply({
        content:
          !result || result.winners.length === 0
            ? "No eligible entrants left to reroll: everyone who entered has already won."
            : `Rerolled. New winner(s): ${result.winners.map((w) => `<@${w}>`).join(", ")}.`,
      });
      return;
    }
  },
};

export default command;
