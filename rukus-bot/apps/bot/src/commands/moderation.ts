import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getModerationConfig, setModerationConfig } from "@rukus/db";
import { invalidate } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("moderation")
    .setDescription("Configure the moderation filters")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("drugfilter")
        .setDescription("Turn the drug/substance filter on or off")
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Enable it?").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("imageonly")
        .setDescription("Set (or clear) the image-only channel")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel where text-only messages get deleted; omit to disable")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("bannedword")
        .setDescription("Add or remove a banned word/phrase")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("What to do")
            .setRequired(true)
            .addChoices(
              { name: "add", value: "add" },
              { name: "remove", value: "remove" },
              { name: "list", value: "list" },
              { name: "toggle-on", value: "on" },
              { name: "toggle-off", value: "off" },
            ),
        )
        .addStringOption((o) =>
          o.setName("word").setDescription("The word or phrase (for add/remove)"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("invites")
        .setDescription("Block Discord invite links from non-staff")
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Enable it?").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("mentions")
        .setDescription("Delete messages that mention too many people")
        .addIntegerOption((o) =>
          o
            .setName("limit")
            .setDescription("Max mentions per message (0 = off)")
            .setMinValue(0)
            .setMaxValue(50)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("logchannel")
        .setDescription("Set (or clear) the channel where removed messages are logged")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("The mod-log channel; omit to disable")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("antispam")
        .setDescription("Turn anti-spam (scam blast protection) on or off")
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Enable it?").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show the current moderation settings"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const config = await getModerationConfig(guildId);

    if (sub === "status") {
      await interaction.reply({
        content:
          `**Moderation settings** (more options on the dashboard)\n` +
          `• Anti-spam: ${config.antiSpamEnabled ? `on (${config.crossPostChannels} channels / ${config.crossPostWindowSec}s, then ${config.spamPunishment})` : "off"}\n` +
          `• Scam detection: ${config.scamHeuristics ? "on" : "off"}\n` +
          `• Blocked domains: ${config.blockedDomains.length}\n` +
          `• Drug filter: ${config.drugFilter ? "on" : "off"}\n` +
          `• Banned words: ${config.bannedWordsEnabled ? "on" : "off"} (${config.bannedWords.length} word(s))\n` +
          `• Invite blocking: ${config.blockInvites ? "on" : "off"}\n` +
          `• Mention limit: ${config.maxMentions || "off"}\n` +
          `• Mod log: ${config.logChannelId ? `<#${config.logChannelId}>` : "not set"}\n` +
          `• Image-only channel: ${config.imageOnlyChannelId ? `<#${config.imageOnlyChannelId}>` : "not set"}`,
        ...ephemeral,
      });
      return;
    }

    const next = { ...config };
    if (sub === "drugfilter") {
      next.drugFilter = interaction.options.getBoolean("enabled", true);
    } else if (sub === "imageonly") {
      const channel = interaction.options.getChannel("channel");
      next.imageOnlyChannelId = channel?.id ?? undefined;
    } else if (sub === "antispam") {
      next.antiSpamEnabled = interaction.options.getBoolean("enabled", true);
      // Enabling anti-spam without scam heuristics leaves the biggest win on
      // the table, so turn both on together.
      if (next.antiSpamEnabled) next.scamHeuristics = true;
    } else if (sub === "invites") {
      next.blockInvites = interaction.options.getBoolean("enabled", true);
    } else if (sub === "mentions") {
      next.maxMentions = interaction.options.getInteger("limit", true);
    } else if (sub === "logchannel") {
      const channel = interaction.options.getChannel("channel");
      next.logChannelId = channel?.id ?? undefined;
    } else if (sub === "bannedword") {
      const action = interaction.options.getString("action", true);
      const word = interaction.options.getString("word")?.trim().toLowerCase();
      if (action === "list") {
        await interaction.reply({
          content: next.bannedWords.length
            ? `Banned words (${next.bannedWordsEnabled ? "enforced" : "NOT enforced, toggle on"}):\n${next.bannedWords.map((w) => `\`${w}\``).join(", ")}`
            : "No banned words configured.",
          ...ephemeral,
        });
        return;
      }
      if (action === "on") next.bannedWordsEnabled = true;
      else if (action === "off") next.bannedWordsEnabled = false;
      else if (!word) {
        await interaction.reply({
          content: "Provide the `word` option for add/remove.",
          ...ephemeral,
        });
        return;
      } else if (action === "add") {
        if (!next.bannedWords.includes(word)) {
          next.bannedWords = [...next.bannedWords, word];
        }
        next.bannedWordsEnabled = true;
      } else if (action === "remove") {
        next.bannedWords = next.bannedWords.filter((w) => w !== word);
      }
    }

    await setModerationConfig(guildId, next);
    invalidate(guildId);
    await interaction.reply({
      content: `✅ Saved. Use \`/moderation status\` to review all settings.`,
      ...ephemeral,
    });
  },
};

export default command;
