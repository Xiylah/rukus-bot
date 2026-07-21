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

const handler: EventHandler<Events.GuildRoleCreate> = {
  name: Events.GuildRoleCreate,
  execute: async (role: Role) => {
    const config = await configFor(role.guild);
    if (!config) return;
    if (!shouldLog(config, "roleCreate")) return;

    const executor = await findExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);

    await emit(
      role.guild,
      "roleCreate",
      compact(
        "🎭 Role created",
        LOG_COLORS.create,
        null,
        [`<@&${role.id}>`, ...byLine(executorOrNull(executor))].join("\n"),
      ),
    );
  },
};

export default handler;
