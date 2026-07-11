import { Events, type GuildMember } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import { welcomeConfig } from "../lib/configCache.js";
import { renderTemplate } from "../features/welcome/template.js";

const handler: EventHandler<Events.GuildMemberAdd> = {
  name: Events.GuildMemberAdd,
  execute: async (member: GuildMember) => {
    const config = await welcomeConfig(member.guild.id);

    // Auto-roles run even when messages are disabled: they are independent.
    for (const roleId of config.joinRoleIds) {
      await member.roles
        .add(roleId, "Auto-role on join")
        .catch((e) => log.warn(`Auto-role ${roleId} failed: ${String(e)}`));
    }

    if (!config.enabled) return;

    if (config.channelId) {
      const channel = member.guild.channels.cache.get(config.channelId);
      if (channel?.isSendable()) {
        await channel
          .send({
            content: renderTemplate(config.message, member),
            allowedMentions: { users: [member.id] },
          })
          .catch(() => {});
      }
    }

    if (config.dmEnabled) {
      await member
        .send(renderTemplate(config.dmMessage, member))
        .catch(() => {}); // DMs closed is normal, stay silent
    }
  },
};

export default handler;
