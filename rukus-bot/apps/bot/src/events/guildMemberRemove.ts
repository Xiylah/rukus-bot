import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { welcomeConfig } from "../lib/configCache.js";
import { renderTemplate } from "../features/welcome/template.js";
import { logMemberLeave } from "../features/logging/members.js";
import { backupRoles } from "../features/autoroles/autoroles.js";

const handler: EventHandler<Events.GuildMemberRemove> = {
  name: Events.GuildMemberRemove,
  execute: async (member: GuildMember | PartialGuildMember) => {
    // Fire-and-forget: a leave-message failure must not swallow the log entry,
    // and the audit-log lookup that distinguishes a kick from a leave is slow.
    void logMemberLeave(member);

    // Snapshot their roles first, and await it: the member object still has its
    // role cache right now, and the leave message below can take long enough
    // that discord.js may evict it before we get back to this.
    await backupRoles(member);

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
