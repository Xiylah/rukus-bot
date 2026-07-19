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
            .setMaxValue(50),
        )
        // Discord has no multi-select channel option, so offer several single
        // pickers. Anything left empty is ignored, and picking none falls back
        // to the dashboard's default channels (then to the current channel).
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Where entries are posted (defaults to here, or your saved channels)")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
              ChannelType.PublicThread,
              ChannelType.AnnouncementThread,
            ),
        )
        .addChannelOption((o) =>
          o
            .setName("channel2")
            .setDescription("A second channel this contest also runs in")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
              ChannelType.PublicThread,
              ChannelType.AnnouncementThread,
            ),
        )
        .addChannelOption((o) =>
          o
            .setName("channel3")
            .setDescription("A third channel this contest also runs in")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
              ChannelType.PublicThread,
              ChannelType.AnnouncementThread,
            ),
        )
        .addChannelOption((o) =>
          o
            .setName("channel4")
            .setDescription("A fourth channel this contest also runs in")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
              ChannelType.PublicThread,
              ChannelType.AnnouncementThread,
            ),
        )
        .addChannelOption((o) =>
          o
            .setName("channel5")
            .setDescription("A fifth channel this contest also runs in")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
              ChannelType.PublicThread,
              ChannelType.AnnouncementThread,
            ),
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

      // Channels: explicit picks win, then the dashboard defaults, then here.
      const picked = ["channel", "channel2", "channel3", "channel4", "channel5"]
        .map((n) => interaction.options.getChannel(n) as TextChannel | null)
        .filter((c): c is TextChannel => c !== null);

      const channelIds = [
        ...new Set(
          picked.length > 0
            ? picked.map((c) => c.id)
            : config.defaultChannelIds.length > 0
              ? config.defaultChannelIds
              : [interaction.channelId],
        ),
      ];

      // A channel can only host one contest at a time, or an entry would be
      // ambiguous. Check every channel before creating anything.
      for (const id of channelIds) {
        const running = await activeContestFor(interaction.guildId, id);
        if (running) {
          await interaction.reply({
            content: `**${running.title}** is already running in <#${id}>. End it first with \`/contest end\`.`,
            ...ephemeral,
          });
          return;
        }
      }

      const title = interaction.options.getString("title", true);
      const description = interaction.options.getString("description") ?? "";
      const winnerCount =
        interaction.options.getInteger("winners") ?? config.defaultWinnerCount;
      const endsAt = new Date(Date.now() + durationMs);

      await interaction.deferReply(ephemeral);

      const contest = await prisma.contest.create({
        data: {
          guildId: interaction.guildId,
          channelIds,
          hostId: interaction.user.id,
          title,
          description,
          winnerCount,
          endsAt,
        },
      });

      const where =
        channelIds.length === 1
          ? "in this channel"
          : `in ${channelIds.map((id) => `<#${id}>`).join(", ")}`;

      const endsUnix = Math.floor(endsAt.getTime() / 1000);
      const embed = new EmbedBuilder()
        .setColor(Number.parseInt(config.embedColor.slice(1), 16))
        .setTitle(`📸 ${title}`)
        .setDescription(
          (description ? `${description}\n\n` : "") +
            `Post your image or video ${where} to enter.\n` +
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

      // Announce in every channel the contest runs in, so members only watching
      // one of them still see it. The first successful post is the one recorded
      // on the row (messageId is unique, and it is only used to find the
      // announcement again).
      let firstPostedId: string | null = null;
      const failed: string[] = [];
      for (const id of channelIds) {
        const target =
          interaction.guild.channels.cache.get(id) ??
          (await interaction.guild.channels.fetch(id).catch(() => null));
        if (!target) {
          failed.push(id);
          continue;
        }

        // A forum has no message list to send into: the announcement has to be
        // a post (a thread) instead, and members then enter by replying in it.
        if (target.type === ChannelType.GuildForum) {
          const thread = await target.threads
            .create({
              name: title.slice(0, 100),
              message: { embeds: [embed] },
            })
            .catch(() => null);
          if (!thread) failed.push(id);
          else if (!firstPostedId) {
            const starter = await thread.fetchStarterMessage().catch(() => null);
            if (starter) firstPostedId = starter.id;
          }
          continue;
        }

        if (!target.isSendable()) {
          failed.push(id);
          continue;
        }
        const posted = await target.send({ embeds: [embed] }).catch(() => null);
        if (!posted) failed.push(id);
        else if (!firstPostedId) firstPostedId = posted.id;
      }

      if (firstPostedId) {
        await prisma.contest
          .update({ where: { id: contest.id }, data: { messageId: firstPostedId } })
          .catch(() => null);
      }

      await interaction.editReply({
        content:
          `Started **${title}** in ${channelIds.map((id) => `<#${id}>`).join(", ")}, ` +
          `ending ${formatDuration(Math.round(durationMs / 1000))} from now. Top ${winnerCount} win.` +
          (failed.length
            ? `\nI couldn't post the announcement in ${failed
                .map((id) => `<#${id}>`)
                .join(", ")}, check my permissions there.`
            : ""),
      });
      return;
    }

    // ---- status / end both need a running contest in this channel ----
    // Run inside a thread, the contest may be set on the parent, so try both.
    const parentId = interaction.channel?.isThread()
      ? interaction.channel.parentId
      : null;
    const contest = await activeContestFor(interaction.guildId, [
      interaction.channelId,
      ...(parentId ? [parentId] : []),
    ]);
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
