import { EmbedBuilder, type Message, type TextChannel } from "discord.js";
import { COLORS, type ModerationConfig } from "@rukus/shared";
import { log } from "../../lib/logger.js";
import { createCase } from "./cases.js";
import { clearUser, type SpamHit } from "./antiSpam.js";

/**
 * Enforcement for anti-spam hits: nuke every copy of the spam, punish the
 * account, and tell staff what happened.
 *
 * Order matters. We delete first (the scam links are the damage), then punish,
 * then log, so a failure in a later step never leaves the spam standing.
 */
export async function enforceSpam(
  message: Message<true>,
  config: ModerationConfig,
  hit: SpamHit,
): Promise<void> {
  const guild = message.guild;
  const author = message.author;

  // Keep a copy for the log before the message is gone.
  const content = message.content.slice(0, 1000);

  // 1. Delete every copy we know about (or just this one).
  const targets = config.purgeAllCopies ? hit.messages : [
    { channelId: message.channelId, messageId: message.id },
  ];
  let deleted = 0;
  for (const t of targets) {
    try {
      const channel =
        guild.channels.cache.get(t.channelId) ??
        (await guild.channels.fetch(t.channelId).catch(() => null));
      if (!channel?.isTextBased()) continue;
      await (channel as TextChannel).messages.delete(t.messageId);
      deleted++;
    } catch {
      /* already deleted or no permission */
    }
  }

  clearUser(guild.id, author.id);

  // 2. Punish the account.
  const member = await guild.members.fetch(author.id).catch(() => null);
  let action = "deleted their messages";
  try {
    if (config.spamPunishment === "timeout" && member?.moderatable) {
      await member.timeout(
        config.spamTimeoutMin * 60_000,
        `Anti-spam: ${hit.reason}`,
      );
      await createCase({
        guild,
        action: "TIMEOUT",
        target: author,
        moderatorId: guild.client.user.id,
        reason: `Anti-spam: ${hit.reason}`,
        durationMin: config.spamTimeoutMin,
      });
      action = `timed out for ${config.spamTimeoutMin}m`;
    } else if (config.spamPunishment === "kick" && member?.kickable) {
      await createCase({
        guild,
        action: "KICK",
        target: author,
        moderatorId: guild.client.user.id,
        reason: `Anti-spam: ${hit.reason}`,
      });
      await member.kick(`Anti-spam: ${hit.reason}`);
      action = "kicked";
    } else if (config.spamPunishment === "ban") {
      await createCase({
        guild,
        action: "BAN",
        target: author,
        moderatorId: guild.client.user.id,
        reason: `Anti-spam: ${hit.reason}`,
      });
      await guild.members.ban(author.id, {
        reason: `Anti-spam: ${hit.reason}`,
        deleteMessageSeconds: 3600,
      });
      action = "banned";
    }
  } catch (err) {
    log.warn(`Anti-spam punishment failed: ${String(err)}`);
  }

  // 3. Tell staff.
  if (!config.logChannelId) return;
  const logChannel = guild.channels.cache.get(config.logChannelId);
  if (!logChannel?.isSendable()) return;

  const accountAgeDays = Math.floor(
    (Date.now() - author.createdTimestamp) / 86_400_000,
  );
  await logChannel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.danger)
          .setTitle("🚨 Spam blocked")
          .addFields(
            { name: "Member", value: `<@${author.id}> (${author.tag})`, inline: true },
            { name: "Reason", value: hit.reason, inline: true },
            { name: "Action", value: action, inline: true },
            {
              name: "Messages removed",
              value: `${deleted} across ${new Set(targets.map((t) => t.channelId)).size} channel(s)`,
              inline: true,
            },
            {
              name: "Account age",
              value: `${accountAgeDays} day(s)`,
              inline: true,
            },
            { name: "Content", value: `\`\`\`${content || "(empty)"}\`\`\`` },
          )
          .setFooter({
            text: "If this was a mistake, adjust Anti-spam on the dashboard.",
          })
          .setTimestamp(),
      ],
    })
    .catch(() => {});
}
