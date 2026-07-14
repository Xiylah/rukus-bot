import {
  AuditLogEvent,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import {
  LOG_COLORS,
  configFor,
  emit,
  executorText,
  findExecutor,
  shouldLog,
} from "./dispatch.js";
import { base, userLine } from "./embeds.js";

/**
 * Join and leave logging.
 *
 * These live here rather than in their own event files because guildMemberAdd
 * and guildMemberRemove already exist for the welcome feature: they call in
 * additively so a member gets one gateway handler, not two competing ones.
 */

export async function logMemberJoin(member: GuildMember): Promise<void> {
  const config = await configFor(member.guild);
  if (!config) return;
  if (!shouldLog(config, "memberJoin", { userId: member.id, isBot: member.user.bot })) {
    return;
  }

  const created = Math.floor(member.user.createdTimestamp / 1000);

  await emit(
    member.guild,
    "memberJoin",
    base("📥 Member joined", LOG_COLORS.create, member).addFields(
      { name: "Member", value: userLine(member), inline: true },
      { name: "Account created", value: `<t:${created}:R>`, inline: true },
      {
        name: "Member count",
        value: String(member.guild.memberCount),
        inline: true,
      },
    ),
  );
}

export async function logMemberLeave(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const config = await configFor(member.guild);
  if (!config) return;

  // Discord gives us one event for "left" and "was kicked" alike. A recent
  // MemberKick audit entry naming this user is the only way to tell them apart,
  // and it is best-effort: without ViewAuditLog we call it a plain leave.
  const kicker = await findExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
  const kicked = Boolean(kicker);

  const event = kicked ? "memberKick" : "memberLeave";
  if (!shouldLog(config, event, { userId: member.id, isBot: member.user.bot })) return;

  const roles = member.roles?.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => r.name);

  const embed = base(
    kicked ? "👢 Member kicked" : "📤 Member left",
    LOG_COLORS.destroy,
    member,
  ).addFields(
    { name: "Member", value: userLine(member), inline: true },
    {
      name: "Member count",
      value: String(member.guild.memberCount),
      inline: true,
    },
  );

  if (kicked) embed.addFields({ name: "Kicked by", value: executorText(kicker) });
  if (roles?.length) {
    embed.addFields({ name: "Roles held", value: roles.join(", ").slice(0, 1024) });
  }

  await emit(member.guild, event, embed);
}
