import { type Message } from "discord.js";
import { rollXp, renderLevelUp } from "@rukus/shared";
import { levelingConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import {
  addXp,
  onCooldown,
  applyRoleRewards,
  announceChannel,
} from "./service.js";

/**
 * The message hook: decides whether a message earns XP, banks it, and handles
 * the level-up.
 *
 * Everything here is best-effort. XP is a nice-to-have; a database blip must
 * never take down the message pipeline that also runs anti-spam and the filters,
 * so the whole body is wrapped and failures are logged, not thrown.
 */
export async function handleMessageXp(message: Message<true>): Promise<void> {
  try {
    const config = await levelingConfig(message.guildId);
    if (!config.enabled) return;
    if (config.ignoreChannelIds.includes(message.channelId)) return;

    const member = message.member;
    if (!member) return;
    if (config.ignoreRoleIds.some((id) => member.roles.cache.has(id))) return;

    // The cooldown is what stops someone farming a level by spamming "a" for a
    // minute. Checked before the roll so a rate-limited message costs one read.
    if (await onCooldown(message.guildId, member.id, config.cooldownSec)) return;

    const multipliers = config.xpMultiplierRoles
      .filter((m) => member.roles.cache.has(m.roleId))
      .map((m) => m.multiplier);

    const amount = rollXp(
      config.xpPerMessageMin,
      config.xpPerMessageMax,
      multipliers,
    );
    if (amount <= 0) return;

    const result = await addXp(message.guildId, member.id, amount);
    if (result.leveledUpTo === null) return;

    const level = result.leveledUpTo;
    await applyRoleRewards(member, config, level);

    if (!config.announceLevelUp) return;

    const text = renderLevelUp(config.announceMessage, {
      userId: member.id,
      username: member.displayName,
      level,
      serverName: message.guild.name,
    });

    const target = announceChannel(message.guild, config);
    if (target) {
      await target.send({ content: text });
    } else if (message.channel.isSendable()) {
      // Reply rather than a bare send so the level-up is attached to the message
      // that earned it, but never ping them twice for the same event.
      await message.reply({
        content: text,
        allowedMentions: { repliedUser: false, users: [member.id] },
      });
    }
  } catch (err) {
    log.warn(`Leveling: XP award failed: ${String(err)}`);
  }
}
