import { Events, type GuildMember } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import { welcomeConfig } from "../lib/configCache.js";
import { renderTemplate } from "../features/welcome/template.js";
import { logMemberJoin } from "../features/logging/members.js";
import { applyAutoRoles } from "../features/autoroles/autoroles.js";
import { trackJoin } from "../features/invites/tracker.js";
import { runJoinGate } from "../features/verification/joinGate.js";
import { onJoinForRaid } from "../features/raid/detect.js";

const handler: EventHandler<Events.GuildMemberAdd> = {
  name: Events.GuildMemberAdd,
  execute: async (member: GuildMember) => {
    // Fire-and-forget: server logging is a separate concern from welcoming and
    // must never delay (or fail) the anything below.
    void logMemberJoin(member);

    // Awaited, unlike the log above: it re-reads Discord's invite list to see
    // which counter moved, and a second join landing first would make the answer
    // ambiguous. It swallows its own errors, so it cannot break the join.
    await trackJoin(member).catch(() => {});

    // Safety gates run BEFORE welcome and auto-roles: a raider must be kicked or
    // quarantined before the server greets them or hands them a role. Raid
    // detection acts on a join spike (kick/quarantine/lockdown); the join gate
    // then screens account age and quarantines until verified. Each swallows its
    // own errors so one failing cannot stop the other, nor the greeting below.
    await onJoinForRaid(member).catch((e) =>
      log.warn(`Raid detection failed: ${String(e)}`),
    );
    // A throw leaves the gate's outcome unknown: it may already have applied the
    // quarantine role before failing. Treat unknown as held, because the cost of
    // fail-open (auto-roling an account the gate was mid-way through rejecting)
    // is far worse than the cost of fail-closed (a real member is not greeted,
    // and gets their roles when they press Verify).
    const gate = await runJoinGate(member).catch((e) => {
      log.warn(`Join gate failed, treating as held: ${String(e)}`);
      return { held: true };
    });

    // A held member is quarantined (or was kicked) and must NOT be auto-roled or
    // greeted: handing them roles now would grant the access the quarantine role
    // exists to withhold, and welcoming an account the gate just rejected reads
    // as the server endorsing it. verifyMember re-runs neither, so the roles they
    // are owed are applied when they actually verify.
    if (gate.held) return;

    // Bot roles, timed roles, and the role restore for a returning member. This
    // is the autoroles feature; welcome's own joinRoleIds below are the legacy
    // path and both are additive, so a guild can use either or both. Runs after
    // the safety gates so a quarantined raider is not auto-roled into the server.
    await applyAutoRoles(member).catch((e) =>
      log.warn(`Auto-roles failed: ${String(e)}`),
    );

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
