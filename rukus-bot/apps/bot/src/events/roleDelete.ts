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
      base("🗑️ Role deleted", LOG_COLORS.destroy).addFields(
        { name: "Role", value: `\`@${role.name}\`\n\`${role.id}\``, inline: true },
        { name: "Members who had it", value: String(role.members.size), inline: true },
        { name: "Deleted by", value: executorText(executor), inline: true },
      ),
    );
  },
};

export default handler;
