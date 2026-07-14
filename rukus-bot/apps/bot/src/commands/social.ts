import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from "discord.js";
import { getSocialAlertsConfig, setSocialAlertsConfig } from "@rukus/db";
import { socialFeedSchema, type SocialFeed, type SocialFeedType } from "@rukus/shared";
import { invalidate } from "../lib/configCache.js";
import { canManageGuild } from "../lib/perms.js";
import { buildAnnouncement, fetchLatest } from "../features/social/poller.js";
import { twitchConfigured } from "../features/social/twitch.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** Short, human-typeable id. Feeds are referenced by it in /social remove|test. */
function shortId(): string {
  return `f_${Math.random().toString(36).slice(2, 8)}`;
}

const TYPE_ICON: Record<SocialFeedType, string> = {
  youtube: "📺",
  twitch: "🟣",
  rss: "📰",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("social")
    .setDescription("Announce new YouTube videos, Twitch streams, and RSS posts")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Watch a new creator or feed")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("What kind of feed is this?")
            .setRequired(true)
            .addChoices(
              { name: "YouTube", value: "youtube" },
              { name: "Twitch", value: "twitch" },
              { name: "RSS / Atom", value: "rss" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("source")
            .setDescription(
              "YouTube: channel URL or ID. Twitch: username. RSS: the feed URL.",
            )
            .setRequired(true)
            .setMaxLength(300),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Where to post the announcements")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Display name, used by {name}. Defaults to the source.")
            .setMaxLength(80),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("Show every watched feed and its id"),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Stop watching a feed")
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("The feed id from /social list")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("test")
        .setDescription("Post a feed's latest item right now, to prove it works")
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("The feed id from /social list")
            .setRequired(true),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    // setDefaultMemberPermissions is only a default: an admin can override it
    // per-guild, so the authority check has to exist in code as well.
    if (!canManageGuild(interaction.member)) {
      await interaction.reply({
        content: "You need **Manage Server** to configure social alerts.",
        ...ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const config = await getSocialAlertsConfig(guildId);

    if (sub === "add") {
      if (config.feeds.length >= 25) {
        await interaction.reply({
          content: "You already watch the maximum of 25 feeds. Remove one first.",
          ...ephemeral,
        });
        return;
      }

      const type = interaction.options.getString("type", true) as SocialFeedType;
      const source = interaction.options.getString("source", true).trim();
      const channel = interaction.options.getChannel("channel", true);
      const displayName =
        interaction.options.getString("name")?.trim() ||
        source.replace(/^https?:\/\//i, "").slice(0, 80);

      const parsed = socialFeedSchema.safeParse({
        id: shortId(),
        type,
        source,
        displayName,
        postChannelId: channel.id,
      });
      if (!parsed.success) {
        await interaction.reply({
          content: `That feed is not valid: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
          ...ephemeral,
        });
        return;
      }
      const feed = parsed.data;

      // Turning the feature on implicitly: someone adding their first feed
      // clearly wants alerts, and a silently-disabled feed is a support ticket.
      await setSocialAlertsConfig(guildId, {
        ...config,
        enabled: true,
        feeds: [...config.feeds, feed],
      });
      invalidate(guildId);

      const twitchNote =
        type === "twitch" && !twitchConfigured()
          ? "\n⚠️ Twitch credentials are not set on the bot, so this feed will be skipped until an operator adds them."
          : "";

      await interaction.reply({
        content:
          `${TYPE_ICON[type]} Now watching **${feed.displayName}** in <#${channel.id}>.\n` +
          `Feed id: \`${feed.id}\` (use it with \`/social test\` and \`/social remove\`).\n` +
          "The first check records what is already there and posts nothing, so you " +
          "don't get a backlog. New items are announced within 5 minutes." +
          twitchNote,
        ...ephemeral,
      });
      return;
    }

    if (sub === "list") {
      if (config.feeds.length === 0) {
        await interaction.reply({
          content:
            "No feeds yet. Add one with `/social add`, or build them on the dashboard's Social alerts page.",
          ...ephemeral,
        });
        return;
      }
      const lines = config.feeds.map(
        (f: SocialFeed) =>
          `${f.enabled ? "🟢" : "⚪"} ${TYPE_ICON[f.type]} **${f.displayName}** ` +
          `\`${f.id}\`\n ${f.source} → ` +
          (f.postChannelId ? `<#${f.postChannelId}>` : "*no channel set*"),
      );
      await interaction.reply({
        content: `**Social alerts** (${config.enabled ? "on" : "off"})\n${lines.join("\n")}`,
        ...ephemeral,
      });
      return;
    }

    const id = interaction.options.getString("id", true).trim();
    const feed = config.feeds.find((f: SocialFeed) => f.id === id);
    if (!feed) {
      await interaction.reply({
        content: `No feed with id \`${id}\`. Run \`/social list\` to see them.`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "remove") {
      await setSocialAlertsConfig(guildId, {
        ...config,
        feeds: config.feeds.filter((f: SocialFeed) => f.id !== id),
      });
      invalidate(guildId);
      await interaction.reply({
        content: `🗑️ Stopped watching **${feed.displayName}**.`,
        ...ephemeral,
      });
      return;
    }

    // test: fetch and post the latest item now, without touching lastItemId, so
    // a test can never make the poller skip the real announcement later.
    await interaction.deferReply(ephemeral);

    if (feed.type === "twitch" && !twitchConfigured()) {
      await interaction.editReply(
        "Twitch credentials are not configured on the bot, so this feed cannot be checked.",
      );
      return;
    }

    let item;
    try {
      item = await fetchLatest(feed);
    } catch (err) {
      await interaction.editReply(
        `❌ Could not read that feed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    if (!item) {
      await interaction.editReply(
        "The feed responded but has no items to show yet.",
      );
      return;
    }
    if (feed.type === "twitch" && item.live !== true) {
      await interaction.editReply(
        `**${feed.displayName}** is not live right now, so there is nothing to post. The feed itself is working.`,
      );
      return;
    }

    const target = feed.postChannelId
      ? await interaction.guild.channels.fetch(feed.postChannelId).catch(() => null)
      : null;
    if (!target?.isTextBased()) {
      await interaction.editReply(
        "That feed has no valid post channel set. Fix it on the dashboard.",
      );
      return;
    }

    try {
      await (target as GuildTextBasedChannel).send(buildAnnouncement(feed, item));
    } catch {
      await interaction.editReply(
        `I can't post in <#${target.id}>. Check my permissions there.`,
      );
      return;
    }

    await interaction.editReply(
      `✅ Posted the latest item from **${feed.displayName}** in <#${target.id}>. ` +
        "This was a test, so the real announcement for it is still queued if it is new.",
    );
  },
};

export default command;
