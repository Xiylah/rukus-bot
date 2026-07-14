import type { Guild, GuildMember } from "discord.js";
import { inviteTrackerConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";
import { attribute, UNATTRIBUTABLE_TEXT, type Attribution } from "./attribute.js";
import { refresh, snapshotOf, vanityOf } from "./cache.js";
import { inviteCount, recordInviteUse } from "./service.js";

/**
 * Invite tracking on join.
 *
 * Ordering matters and is subtle: we must re-fetch Discord's invite list as soon
 * as possible after the join, because a SECOND person joining before we look
 * would move a second counter and turn a clean answer into an ambiguous one. So
 * the refresh happens first, before any config check that could await on the
 * database, and the cache is updated by that same refresh so back-to-back joins
 * each diff against the state left by the one before.
 */

/** Fill the log template. Unattributed joins get an honest sentence, not a guess. */
function renderMessage(
  template: string,
  member: GuildMember,
  attribution: Attribution,
  invites: number,
): string {
  const inviter =
    attribution.kind === "invite" && attribution.inviterId
      ? `<@${attribution.inviterId}>`
      : UNATTRIBUTABLE_TEXT[
          attribution.kind === "none" ? attribution.reason : "unknown"
        ];

  return template
    .replace(/\{user\}/gi, `<@${member.id}>`)
    .replace(/\{username\}/gi, member.displayName)
    .replace(/\{inviter\}/gi, inviter)
    .replace(/\{invites\}/gi, String(invites))
    .replace(/\{code\}/gi, attribution.kind === "invite" ? attribution.code : "unknown")
    .replace(/\{server\}/gi, member.guild.name);
}

/** Work out who invited this member, and say so in the log channel. */
export async function trackJoin(member: GuildMember): Promise<void> {
  const guild: Guild = member.guild;

  // Snapshot BEFORE the refresh overwrites it. Null means the guild was never
  // primed (no Manage Server permission), in which case we have nothing to diff
  // against and must not pretend otherwise.
  const before = snapshotOf(guild.id);
  const vanityBefore = vanityOf(guild.id);

  const fresh = await refresh(guild);

  const config = await inviteTrackerConfig(guild.id);
  if (!config.enabled) return;

  const attribution: Attribution =
    before && fresh
      ? attribute(before, fresh.invites, {
          before: vanityBefore,
          after: fresh.vanity,
        })
      : { kind: "none", reason: "unknown" };

  // A bot has no inviter worth crediting, and an invite that credits itself
  // would inflate somebody's count.
  const inviterId =
    attribution.kind === "invite" && attribution.inviterId !== member.id
      ? attribution.inviterId
      : null;

  let invites = 0;
  if (inviterId) {
    try {
      await recordInviteUse(guild.id, inviterId, member.id, attribution.kind === "invite" ? attribution.code : "");
      invites = await inviteCount(guild.id, inviterId);
    } catch (err) {
      // A failed write must not swallow the log message: we still know who it
      // was, we just could not persist the count.
      log.warn(`Could not record the invite use in ${guild.id}: ${String(err)}`);
    }
  }

  if (!config.logChannelId) return;
  const channel = guild.channels.cache.get(config.logChannelId);
  if (!channel?.isSendable()) return;

  await channel
    .send({
      content: renderMessage(config.message, member, attribution, invites).slice(0, 2000),
      // The message mentions both the joiner and the inviter, and neither should
      // be pinged: this is a log line, not a summons.
      allowedMentions: { parse: [] },
    })
    .catch((e) => log.warn(`Invite log failed in ${guild.id}: ${String(e)}`));
}
