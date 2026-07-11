import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { welcomeConfig } from "../lib/configCache.js";
import { renderTemplate } from "../features/welcome/template.js";

const handler: EventHandler<Events.GuildMemberRemove> = {
  name: Events.GuildMemberRemove,
  execute: async (member: GuildMember | PartialGuildMember) => {
    const config = await welcomeConfig(member.guild.id);
    if (!config.leaveEnabled || !config.leaveChannelId) return;

    const channel = member.guild.channels.cache.get(config.leaveChannelId);
    if (!channel?.isSendable()) return;

    await channel
      .send({
        // No mention: they are gone, a ping would be dead anyway.
        content: renderTemplate(config.leaveMessage, member, { noMention: true }),
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  },
};

export default handler;
