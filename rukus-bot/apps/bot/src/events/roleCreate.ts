import { AuditLogEvent, Events, type Role } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  base,
  configFor,
  emit,
  executorText,
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
      base("🎭 Role created", LOG_COLORS.create).addFields(
        { name: "Role", value: `<@&${role.id}> (\`${role.name}\`)`, inline: true },
        { name: "Created by", value: executorText(executor), inline: true },
      ),
    );
  },
};

export default handler;
