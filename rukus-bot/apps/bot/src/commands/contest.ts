import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { prisma } from "@rukus/db";
import { parseDuration, formatDuration } from "@rukus/shared";
import { canManageGuild, hasAnyRole } from "../lib/perms.js";
import { contestsConfig } from "../lib/configCache.js";
import { resolvedMention } from "../lib/mentions.js";
import {
  activeContestFor,
  endContest,
  placeLabel,
  standings,
} from "../features/contests/service.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("contest")
    .setDescription("Run a photo or video contest")
    // Not gated by default member permissions: hostRoleIds lets a server hand
    // contests to an events team with no Manage Server. Each subcommand checks
    // in code.
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Start a contest in a channel")
        .addStringOption((o) =>
          o.setName("title").setDescription("What the contest is called").setRequired(true).setMaxLength(200),
        )
        .addStringOption((o) =>
          o
            .setName("duration")
            .setDescription('How long it runs, e.g. "2h", "3d", "1w"')
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("winners")
            .setDescription("How many places to award (1 = winner only, 3 = 1st/2nd/3rd)")
            .setMinValue(1)
            .setMaxValue(20),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Where entries are posted (defaults to here)")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((o) =>
          o.setName("description").setDescription("Shown on the announcement").setMaxLength(2000),
        ),
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show the live standings of the running contest"),
    )
    .addSubcommand((s) =>
      s.setName("end").setDescription("End the running contest now and announce winners"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const config = await contestsConfig(interaction.guildId);

    if (!config.enabled) {
      await interaction.reply({
        content:
          "Contests are turned off for this server. Enable them on the dashboard first.",
        ...ephemeral,
      });
      return;
    }

    // Manage Server always works; hostRoleIds is the opt-in for an events team.
    const member = interaction.member;
    const allowed =
      canManageGuild(member) || hasAnyRole(member, config.hostRoleIds);
    if (!allowed) {
      await interaction.reply({
        content: "You need Manage Server (or a contest host role) to do that.",
        ...ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    // ---- start ----
    if (sub === "start") {
      const durationMs = parseDuration(
        interaction.options.getString("duration", true),
      );
      if (durationMs === null) {
        await interaction.reply({
          content:
            "I couldn't read that duration. Use something like `2h`, `3d`, or `1w`.",
          ...ephemeral,
        });
        return;
      }

      const channel =
        (interaction.options.getChannel("channel") as TextChannel | null) ??
        (interaction.channel as TextChannel);

      const running = await activeContestFor(interaction.guildId, channel.id);
      if (running) {
        await interaction.reply({
          content: `**${running.title}** is already running in ${channel}. End it first with \`/contest end\`.`,
          ...ephemeral,
        });
        return;
      }

      const title = interaction.options.getString("title", true);
      const description = interaction.options.getString("description") ?? "";
      const winnerCount = interaction.options.getInteger("winners") ?? 3;
      const endsAt = new Date(Date.now() + durationMs);

      await interaction.deferReply(ephemeral);

      const contest = await prisma.contest.create({
        data: {
          guildId: interaction.guildId,
          channelId: channel.id,
          hostId: interaction.user.id,
          title,
          description,
          winnerCount,
          endsAt,
        },
      });

      const endsUnix = Math.floor(endsAt.getTime() / 1000);
      const embed = new EmbedBuilder()
        .setColor(Number.parseInt(config.embedColor.slice(1), 16))
        .setTitle(`📸 ${title}`)
        .setDescription(
          (description ? `${description}\n\n` : "") +
            `Post your image or video in this channel to enter.\n` +
            `Vote by reacting ${config.voteEmoji} on the entries you like.`,
        )
        .addFields(
          { name: "Ends", value: `<t:${endsUnix}:R>`, inline: true },
          {
            name: "Places",
            value: `Top ${winnerCount}`,
            inline: true,
          },
          {
            name: "Entries per person",
            value:
              config.maxEntriesPerUser > 0
                ? String(config.maxEntriesPerUser)
                : "Unlimited",
            inline: true,
          },
        )
        .setFooter({ text: "Self-votes do not count." })
        .setTimestamp(endsAt);

      const posted = await channel
        .send({ embeds: [embed] })
        .catch(() => null);
      if (posted) {
        await prisma.contest
          .update({ where: { id: contest.id }, data: { messageId: posted.id } })
          .catch(() => null);
      }

      await interaction.editReply({
        content:
          `Started **${title}** in ${channel}, ending ${formatDuration(Math.round(durationMs / 1000))} from now.` +
          (posted ? "" : "\nI couldn't post the announcement there, check my permissions."),
      });
      return;
    }

    // ---- status / end both need a running contest in this channel ----
    const contest = await activeContestFor(
      interaction.guildId,
      interaction.channelId,
    );
    if (!contest) {
      await interaction.reply({
        content: "There's no contest running in this channel.",
        ...ephemeral,
      });
      return;
    }

    if (sub === "status") {
      await interaction.deferReply(ephemeral);
      const board = await standings(interaction.guild, contest, config);
      const lines = await Promise.all(
        board.map(async (s, i) => {
          const who = await resolvedMention(interaction.guild, s.userId);
          return `${placeLabel(i)} ${who} - **${s.votes}** vote${s.votes === 1 ? "" : "s"}`;
        }),
      );
      await interaction.editReply({
        content:
          `**${contest.title}** ends <t:${Math.floor(contest.endsAt.getTime() / 1000)}:R>\n\n` +
          (lines.length ? lines.join("\n") : "_No entries yet._"),
      });
      return;
    }

    // ---- end ----
    await interaction.deferReply(ephemeral);
    const result = await endContest(interaction.guild, contest, config);
    await interaction.editReply({
      content: result
        ? `Ended **${contest.title}** with ${result.winners.length} winner(s). Results posted.`
        : "That contest was already ended.",
    });
  },
};

export default command;
