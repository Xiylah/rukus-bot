import { AuditLogEvent, Events, type GuildBan } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  base,
  configFor,
  emit,
  executorText,
  findExecutor,
  shouldLog,
  userLine,
} from "../features/logging/index.js";

const handler: EventHandler<Events.GuildBanRemove> = {
  name: Events.GuildBanRemove,
  execute: async (ban: GuildBan) => {
    const config = await configFor(ban.guild);
    if (!config) return;
    if (!shouldLog(config, "memberUnban", { userId: ban.user.id })) return;

    const executor = await findExecutor(
      ban.guild,
      AuditLogEvent.MemberBanRemove,
      ban.user.id,
    );

    const embed = base("🕊️ Member unbanned", LOG_COLORS.create, ban.user).addFields(
      { name: "Member", value: userLine(ban.user), inline: true },
      { name: "Unbanned by", value: executorText(executor), inline: true },
    );

    await emit(ban.guild, "memberUnban", embed);
  },
};

export default handler;
