import {
  AuditLogEvent,
  Events,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  compact,
  configFor,
  emit,
  executorText,
  findExecutor,
  roleMentions,
  shouldLog,
  userLine,
} from "../features/logging/index.js";

/**
 * One gateway event covers roles, nicknames, and avatars, but they are three
 * separate toggles and often three separate audiences, so each fires its own
 * embed and any of them can be off independently.
 */
const handler: EventHandler<Events.GuildMemberUpdate> = {
  name: Events.GuildMemberUpdate,
  execute: async (
    before: GuildMember | PartialGuildMember,
    after: GuildMember,
  ) => {
    const config = await configFor(after.guild);
    if (!config) return;

    const scope = { userId: after.id, isBot: after.user.bot };

    // ---- Roles ----
    const beforeRoles = before.roles?.cache;
    if (beforeRoles && shouldLog(config, "memberRoleChange", scope)) {
      const added = after.roles.cache.filter((r) => !beforeRoles.has(r.id));
      const removed = beforeRoles.filter((r) => !after.roles.cache.has(r.id));

      if (added.size || removed.size) {
        const executor = await findExecutor(
          after.guild,
          AuditLogEvent.MemberRoleUpdate,
          after.id,
        );

        // Title says what happened so the entry is readable from the title
        // alone; "Roles changed" made every add and every remove look alike.
        const title =
          added.size && removed.size
            ? "🎭 Roles updated"
            : added.size
              ? added.size > 1
                ? "🎭 Roles added"
                : "🎭 Role added"
              : removed.size > 1
                ? "🎭 Roles removed"
                : "🎭 Role removed";

        const lines = [userLine(after)];
        if (added.size) {
          lines.push(`**+** ${roleMentions(added.map((r) => r.id))}`);
        }
        if (removed.size) {
          lines.push(`**−** ${roleMentions(removed.map((r) => r.id))}`);
        }
        // Only name the actor when we actually know it. "Unknown (no audit log
        // access)" is a whole line telling the reader nothing, and it is the
        // normal case for self-serve reaction roles.
        if (executor && executor.id !== after.id) {
          lines.push(`-# by ${executorText(executor)}`);
        }

        const embed = compact(
          title,
          LOG_COLORS.update,
          after,
          lines.join("\n"),
        );
        await emit(after.guild, "memberRoleChange", embed);
      }
    }

    // ---- Nickname ----
    if (
      before.nickname !== after.nickname &&
      shouldLog(config, "memberNickChange", scope)
    ) {
      const executor = await findExecutor(
        after.guild,
        AuditLogEvent.MemberUpdate,
        after.id,
      );
      const lines = [
        userLine(after),
        `${before.nickname ?? "*none*"} → **${after.nickname ?? "*none*"}**`,
      ];
      if (executor && executor.id !== after.id) {
        lines.push(`-# by ${executorText(executor)}`);
      }
      const embed = compact(
        "📝 Nickname changed",
        LOG_COLORS.update,
        after,
        lines.join("\n"),
      );
      await emit(after.guild, "memberNickChange", embed);
    }

    // ---- Server avatar ----
    if (
      before.avatar !== after.avatar &&
      shouldLog(config, "memberAvatarChange", scope)
    ) {
      const embed = compact(
        "🖼️ Server avatar changed",
        LOG_COLORS.update,
        after,
        userLine(after),
      ).setThumbnail(after.displayAvatarURL({ size: 256 }));
      await emit(after.guild, "memberAvatarChange", embed);
    }
  },
};

export default handler;
