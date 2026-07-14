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

const handler: EventHandler<Events.GuildBanAdd> = {
  name: Events.GuildBanAdd,
  execute: async (ban: GuildBan) => {
    const config = await configFor(ban.guild);
    if (!config) return;
    // ignoreBots is deliberately NOT applied to bans: a banned bot is exactly
    // the kind of thing a moderator wants to see in the log.
    if (!shouldLog(config, "memberBan", { userId: ban.user.id })) return;

    const executor = await findExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    // The gateway event carries no reason for uncached bans; fetch fills it in.
    const reason =
      ban.reason ?? (await ban.fetch().then((b) => b.reason).catch(() => null));

    const embed = base("🔨 Member banned", LOG_COLORS.destroy, ban.user).addFields(
      { name: "Member", value: userLine(ban.user), inline: true },
      { name: "Banned by", value: executorText(executor), inline: true },
      { name: "Reason", value: reason || "No reason provided" },
    );

    await emit(ban.guild, "memberBan", embed);
  },
};

export default handler;
