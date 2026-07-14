import {
  AuditLogEvent,
  Events,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  base,
  changeLine,
  configFor,
  diffBlock,
  emit,
  executorText,
  findExecutor,
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
        const embed = base("🎭 Roles changed", LOG_COLORS.update, after).addFields(
          { name: "Member", value: userLine(after), inline: true },
          { name: "Changed by", value: executorText(executor), inline: true },
          {
            name: "Roles",
            value: diffBlock(
              added.map((r) => r.name),
              removed.map((r) => r.name),
            ),
          },
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
      const embed = base("📝 Nickname changed", LOG_COLORS.update, after).addFields(
        { name: "Member", value: userLine(after), inline: true },
        { name: "Changed by", value: executorText(executor), inline: true },
        { name: "Nickname", value: changeLine(before.nickname, after.nickname) },
      );
      await emit(after.guild, "memberNickChange", embed);
    }

    // ---- Server avatar ----
    if (
      before.avatar !== after.avatar &&
      shouldLog(config, "memberAvatarChange", scope)
    ) {
      const embed = base("🖼️ Server avatar changed", LOG_COLORS.update, after)
        .addFields({ name: "Member", value: userLine(after), inline: true })
        .setThumbnail(after.displayAvatarURL());
      await emit(after.guild, "memberAvatarChange", embed);
    }
  },
};

export default handler;
