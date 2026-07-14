import { Events, type GuildMember } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import { welcomeConfig } from "../lib/configCache.js";
import { renderTemplate } from "../features/welcome/template.js";
import { logMemberJoin } from "../features/logging/members.js";
import { applyAutoRoles } from "../features/autoroles/autoroles.js";
import { trackJoin } from "../features/invites/tracker.js";

const handler: EventHandler<Events.GuildMemberAdd> = {
  name: Events.GuildMemberAdd,
  execute: async (member: GuildMember) => {
    // Fire-and-forget: server logging is a separate concern from welcoming and
    // must never delay (or fail) the auto-roles below.
    void logMemberJoin(member);

    // Awaited, unlike the log above: it re-reads Discord's invite list to see
    // which counter moved, and a second join landing first would make the answer
    // ambiguous. It swallows its own errors, so it cannot break the join.
    await trackJoin(member).catch(() => {});

    // Bot roles, timed roles, and the role restore for a returning member. This
    // is the autoroles feature; welcome's own joinRoleIds below are the legacy
    // path and both are additive, so a guild can use either or both.
    await applyAutoRoles(member);

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
