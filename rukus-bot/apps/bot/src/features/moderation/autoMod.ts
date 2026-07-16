import { EmbedBuilder, type Message, type GuildMember } from "discord.js";
import { COLORS, type ModerationConfig } from "@rukus/shared";
import { containsDrugTerm, randomDrugWarning } from "./filters.js";

/** Matches discord.gg/xyz, discord.com/invite/xyz, discordapp.com/invite/... */
const INVITE_RE =
  /(?:discord\.(?:gg|io|me)|discord(?:app)?\.com\/invite)\/[\w-]+/i;

export interface FilterHit {
  /** Which rule fired, for the log. */
  rule: "drug filter" | "banned word" | "invite link" | "mass mentions";
  /** Short public warning posted in the channel (auto-deletes). */
  warning: string;
}

/** Check every enabled filter. Returns the first hit, or null when clean. */
export function checkFilters(
  message: Message<true>,
  config: ModerationConfig,
): FilterHit | null {
  const content = message.content;
  if (!content) return null;

  // Staff and configured roles are exempt from all filters.
  const member = message.member as GuildMember | null;
  if (member) {
    if (member.permissions.has("ManageMessages")) return null;
    if (config.exemptRoleIds.some((r) => member.roles.cache.has(r))) return null;
  }

  if (config.drugFilter && containsDrugTerm(content, config.drugTerms)) {
    return { rule: "drug filter", warning: randomDrugWarning(config.drugWarning) };
  }

  if (config.bannedWordsEnabled && config.bannedWords.length > 0) {
    const lower = content.toLowerCase();
    for (const word of config.bannedWords) {
      const w = word.toLowerCase().trim();
      if (!w) continue;
      // Whole-word for single words; substring for phrases with spaces.
      const hit = w.includes(" ")
        ? lower.includes(w)
        : new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower);
      if (hit) {
        return {
          rule: "banned word",
          warning: "That word isn't allowed here, please keep it clean.",
        };
      }
    }
  }

  if (config.blockInvites && INVITE_RE.test(content)) {
    return {
      rule: "invite link",
      warning: "Posting server invites isn't allowed here.",
    };
  }

  if (config.maxMentions > 0) {
    const count = message.mentions.users.size + message.mentions.roles.size;
    if (count > config.maxMentions) {
      return {
        rule: "mass mentions",
        warning: `Please don't mention more than ${config.maxMentions} people at once.`,
      };
    }
  }

  return null;
}

/** Post a record of a filtered message to the mod-log channel, if set. */
export async function logFiltered(
  message: Message<true>,
  config: ModerationConfig,
  hit: FilterHit,
): Promise<void> {
  if (!config.logChannelId) return;
  const channel = message.guild.channels.cache.get(config.logChannelId);
  if (!channel?.isSendable()) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle(`Message removed: ${hit.rule}`)
    .addFields(
      { name: "Author", value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: "Channel", value: `<#${message.channelId}>`, inline: true },
      {
        name: "Content",
        value: message.content.slice(0, 1024) || "*(empty)*",
      },
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}
