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
import { compact, roleMentions, userLine } from "./embeds.js";

/** 1st, 2nd, 3rd, 4th... including the 11th-13th exceptions. */
function ordinal(n: number): string {
  const s = n.toLocaleString("en-US");
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${s}th`;
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${s}${suffix}`;
}

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
    compact(
      "📥 Member joined",
      LOG_COLORS.create,
      member,
      [
        userLine(member),
        `${ordinal(member.guild.memberCount)} to join`,
        // Relative, not absolute: "3 years ago" answers "is this a throwaway?"
        // at a glance, which is the only reason a join log shows this at all.
        `-# account created <t:${created}:R>`,
      ].join("\n"),
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

  const roleIds = member.roles?.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => r.id);

  const lines = [
    userLine(member),
    `-# ${member.guild.memberCount} members remaining`,
  ];
  if (kicked) lines.push(`-# kicked by ${executorText(kicker)}`);

  const embed = compact(
    kicked ? "👢 Member kicked" : "📤 Member left",
    LOG_COLORS.destroy,
    member,
    lines.join("\n"),
  );

  // Roles stay a field: on a leave this is the one thing a mod may need to
  // restore by hand, so it earns the heading that makes it findable.
  if (roleIds?.length) {
    embed.addFields({ name: "Roles held", value: roleMentions(roleIds) });
  }

  await emit(member.guild, event, embed);
}
