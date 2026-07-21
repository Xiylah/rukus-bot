import { AuditLogEvent, Events, type Role } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  byLine,
  compact,
  configFor,
  emit,
  executorOrNull,
  findExecutor,
  shouldLog,
} from "../features/logging/index.js";

const handler: EventHandler<Events.GuildRoleDelete> = {
  name: Events.GuildRoleDelete,
  execute: async (role: Role) => {
    const config = await configFor(role.guild);
    if (!config) return;
    if (!shouldLog(config, "roleDelete")) return;

    const executor = await findExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);

    await emit(
      role.guild,
      "roleDelete",
      compact(
        "🗑️ Role deleted",
        LOG_COLORS.destroy,
        null,
        [
          `\`@${role.name}\``,
          `-# ${role.members.size} member(s) had it · \`${role.id}\``,
          ...byLine(executorOrNull(executor)),
        ].join("\n"),
      ),
    );
  },
};

export default handler;
