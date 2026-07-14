import { AuditLogEvent, Events, type Role } from "discord.js";
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
} from "../features/logging/index.js";

const handler: EventHandler<Events.GuildRoleUpdate> = {
  name: Events.GuildRoleUpdate,
  execute: async (before: Role, after: Role) => {
    const config = await configFor(after.guild);
    if (!config) return;
    if (!shouldLog(config, "roleUpdate")) return;

    const fields: { name: string; value: string }[] = [];

    if (before.name !== after.name) {
      fields.push({ name: "Name", value: changeLine(before.name, after.name) });
    }
    if (before.hexColor !== after.hexColor) {
      fields.push({ name: "Color", value: changeLine(before.hexColor, after.hexColor) });
    }
    if (before.hoist !== after.hoist) {
      fields.push({
        name: "Shown separately",
        value: changeLine(String(before.hoist), String(after.hoist)),
      });
    }
    if (before.mentionable !== after.mentionable) {
      fields.push({
        name: "Mentionable",
        value: changeLine(String(before.mentionable), String(after.mentionable)),
      });
    }

    // Permissions are the change people actually audit, so they get the
    // green/red diff treatment rather than a wall of before/after flags.
    const beforePerms = before.permissions.toArray();
    const afterPerms = after.permissions.toArray();
    const granted = afterPerms.filter((p) => !beforePerms.includes(p));
    const revoked = beforePerms.filter((p) => !afterPerms.includes(p));
    if (granted.length || revoked.length) {
      fields.push({ name: "Permissions", value: diffBlock(granted, revoked) });
    }

    if (fields.length === 0) return;

    const executor = await findExecutor(after.guild, AuditLogEvent.RoleUpdate, after.id);

    await emit(
      after.guild,
      "roleUpdate",
      base("⚙️ Role updated", LOG_COLORS.update).addFields(
        { name: "Role", value: `<@&${after.id}>`, inline: true },
        { name: "Changed by", value: executorText(executor), inline: true },
        ...fields,
      ),
    );
  },
};

export default handler;
