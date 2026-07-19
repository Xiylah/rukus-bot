import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("See everything the bot can do"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle("Rukus Bot")
      .setDescription("Everything here is also configurable on the web dashboard.")
      .addFields(
        {
          name: "🎫 Tickets",
          value:
            "`/ticket panel` post the ticket panel\n" +
            "`/ticket setup` quick setup\n" +
            "`/ticket close` `claim` `add` `remove` manage a ticket (staff)\n" +
            "`/ticket translate` two-way live translation with the opener\n" +
            "Openers get a 5-star rating DM when their ticket closes",
        },
        {
          name: "📝 Forms",
          value:
            "`/form panel` post the applications panel\n" +
            "`/form list` list configured forms",
        },
        {
          name: "🎭 Reaction roles",
          value:
            "Self-assign roles by reaction, button, or dropdown.\n" +
            "`/reactionroles post <panel>` post or update a panel\n" +
            "`/reactionroles list` list panels and their ids\n" +
            "Panels are built on the dashboard (8 modes: unique, verify, limit, lock and more)",
        },
        {
          name: "🌐 Translation",
          value:
            "`/translate` translate text\n" +
            "Right-click a message > Apps > Translate / Detect Language\n" +
            "React with a flag emoji to translate a message\n" +
            "`/translation` configure auto-translate (admin)\n" +
            "Translating things it shouldn't? The dashboard has a tester that " +
            "shows exactly why, plus never-translate word lists",
        },
        {
          name: "💬 Auto-responder",
          value:
            "Answers common questions automatically.\n" +
            "`/autoresponder` configure it (admin)",
        },
        {
          name: "⌨️ Custom commands",
          value:
            "This server can define its own commands like `!codes`.\n" +
            "`/commands` lists them all\n" +
            "TagScript is supported: `{user}`, `{args}`, `{if}`, `{math}`, `{embed}` and more",
        },
        {
          name: "📈 Leveling",
          value:
            "Earn XP for chatting and in voice, level up, unlock role rewards.\n" +
            "`/rank [user]` see a rank card\n" +
            "`/leaderboard [page]` see the server leaderboard\n" +
            "`/xp give|take|set <user> <amount>` adjust XP (admin)\n" +
            "`/levels reset <user>` `/levels reset-all` wipe XP (admin)",
        },
        {
          name: "⭐ Starboard",
          value:
            "React to a message enough times and it gets mirrored to the starboard.\n" +
            "Emoji, threshold, and ignored channels are set on the dashboard",
        },
        {
          name: "💡 Suggestions",
          value:
            "`/suggest <text>` post a suggestion for the server to vote on\n" +
            "`/suggestion approve|deny|consider|implement <number> [reason]` decide (staff)",
        },
        {
          name: "📸 Contests",
          value:
            "Photo and video contests decided by member votes.\n" +
            "`/contest start <title> <duration> [winners] [channel]` begin one\n" +
            "`/contest status` live standings, `/contest end` finish early\n" +
            "Members just post an image or video in the channel to enter, then " +
            "everyone reacts to vote. Self-votes do not count.",
        },
        {
          name: "🎉 Giveaways",
          value:
            "`/giveaway start <duration> <winners> <prize>`\n" +
            "`/giveaway end <id>` end one early\n" +
            "`/giveaway reroll <id>` draw a new winner\n" +
            "Members enter with a button; winners can be DMed",
        },
        {
          name: "🛡️ Moderation",
          value:
            "`/warn` `/mute` `/timeout` `/kick` `/ban` each recorded as a case\n" +
            "`/unmute` `/history` `/case view|delete|clear`\n" +
            "`/note add|list|remove|clear` private staff notes on a member\n" +
            "Warn escalation: enough active warns auto-applies a timeout, kick or ban\n" +
            "Anti-spam blocks scam blasts automatically\n" +
            "Auto-filters: drug terms, banned words, invite links, mass mentions\n" +
            "`/moderation` configure filters and escalation (admin)\n" +
            "`/purge` bulk-delete, `/slowmode` set channel slowmode",
        },
        {
          name: "✅ Verification and raid protection",
          value:
            "Verify gate: new members clear a button or captcha panel to get in.\n" +
            "`/verification post` post the verify panel, `/verification status`\n" +
            "Join gate screens accounts younger than a set age (kick or quarantine)\n" +
            "Raid protection trips when joins spike: lockdown, kick-new, or alert.\n" +
            "`/raid status` `/raid lift` `/raid panic` (admin), auto-lifts on a timer\n" +
            "Both are configured on the dashboard",
        },
        {
          name: "📜 Logging",
          value:
            "Audit logs for messages, joins, bans, roles, channels, voice, and invites.\n" +
            "`/logging setup` pick the log channels (admin)\n" +
            "`/logging status` see where each stream goes",
        },
        {
          name: "🔒 Locks and roles",
          value:
            "`/lockdown channel|server [duration]` lock things down\n" +
            "`/unlockdown [channel]` lift a lock\n" +
            "`/role add|remove|all|info` manage roles in bulk\n" +
            "`/temprole <user> <role> <duration>` a role that expires by itself",
        },
        {
          name: "👋 Welcome and auto-roles",
          value:
            "Welcome/leave messages, welcome DMs.\n" +
            "`/welcome` configure it (admin)\n" +
            "Auto-roles grant roles on join, on a delay, or restore them when " +
            "someone rejoins (configured on the dashboard)",
        },
        {
          name: "⏰ Reminders and highlights",
          value:
            "`/remind me <when> <what> [repeat]` get a nudge later\n" +
            "`/remind list` `/remind delete <id>`\n" +
            "`/highlight add|remove|list|clear` get a DM when a word you care about is said\n" +
            "`/afk [message]` tell people you're away",
        },
        {
          name: "🎂 Community",
          value:
            "`/birthday set <day> <month>` `/birthday remove|list|view` birthdays\n" +
            "`/invites [user]` see who has invited the most members\n" +
            "`/social add|list|remove|test` YouTube, Twitch and RSS alerts (admin)\n" +
            "Temporary voice channels: join the lobby channel to get your own (set on the dashboard)",
        },
        {
          name: "🔧 Utility",
          value:
            "`/poll <question>` run a quick poll\n" +
            "`/embed` build an embed (staff)\n" +
            "`/serverinfo` `/userinfo` `/avatar` info commands\n" +
            "`/ping` check the bot is alive",
        },
      );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
