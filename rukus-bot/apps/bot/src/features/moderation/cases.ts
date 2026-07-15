import { EmbedBuilder, type Attachment, type Guild, type User } from "discord.js";
import { randomBytes } from "node:crypto";
import { prisma, type CaseAction } from "@rukus/db";
import { COLORS } from "@rukus/shared";
import { moderationConfig } from "../../lib/configCache.js";
import { log } from "../../lib/logger.js";

const MAX_PROOF_BYTES = 8 * 1024 * 1024; // Discord's default upload cap
const PROOF_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * Download a proof attachment and prepare it for storage. Discord CDN links
 * EXPIRE after a couple of weeks, so we keep the bytes ourselves and the
 * dashboard serves them forever at /proof/<token>.
 * Returns null (with a human reason) when the attachment can't be used.
 */
async function fetchProof(
  attachment: Attachment,
): Promise<
  | { token: string; data: string; contentType: string; url?: string }
  | { error: string }
> {
  const type = attachment.contentType?.split(";")[0]?.trim() ?? "";
  if (!PROOF_TYPES.has(type)) {
    return { error: "Proof must be an image (png, jpg, gif, or webp)." };
  }
  if (attachment.size > MAX_PROOF_BYTES) {
    return { error: "Proof image is too large (max 8 MB)." };
  }
  try {
    const res = await fetch(attachment.url);
    if (!res.ok) return { error: "Couldn't download the attachment from Discord." };
    const buf = Buffer.from(await res.arrayBuffer());
    const token = randomBytes(24).toString("hex");
    const base = process.env.DASHBOARD_URL?.replace(/\/+$/, "");
    return {
      token,
      data: buf.toString("base64"),
      contentType: type,
      url: base ? `${base}/proof/${token}` : undefined,
    };
  } catch {
    return { error: "Couldn't download the attachment from Discord." };
  }
}

/**
 * Moderation case system: every action (/warn, /timeout, /kick, /ban, ...)
 * becomes a numbered case, forming a per-user record that /history and the
 * dashboard can browse.
 */

const ACTION_STYLE: Record<CaseAction, { emoji: string; color: number; verb: string }> = {
  WARN: { emoji: "⚠️", color: COLORS.warning, verb: "warned" },
  TIMEOUT: { emoji: "🔇", color: COLORS.warning, verb: "timed out" },
  UNTIMEOUT: { emoji: "🔊", color: COLORS.success, verb: "un-timed out" },
  MUTE: { emoji: "🤐", color: COLORS.warning, verb: "muted" },
  UNMUTE: { emoji: "🗣️", color: COLORS.success, verb: "unmuted" },
  KICK: { emoji: "👢", color: COLORS.danger, verb: "kicked" },
  BAN: { emoji: "🔨", color: COLORS.danger, verb: "banned" },
  UNBAN: { emoji: "🕊️", color: COLORS.success, verb: "unbanned" },
};

/** Reserve the next sequential case number for a guild, atomically. */
async function nextCaseNumber(guildId: string): Promise<number> {
  const row = await prisma.caseCounter.upsert({
    where: { guildId },
    create: { guildId, next: 2 },
    update: { next: { increment: 1 } },
  });
  return row.next - 1;
}

export interface NewCase {
  guild: Guild;
  action: CaseAction;
  target: User;
  moderatorId: string;
  reason?: string;
  durationMin?: number;
  /** Optional proof image attached by the moderator. */
  proof?: Attachment | null;
}

export interface CaseResult {
  number: number;
  /**
   * False when the server turned case logging off. The action still happened;
   * it just left no record, so callers must not print a case number.
   */
  recorded: boolean;
  /** Hosted proof URL, when a proof image was stored and DASHBOARD_URL set. */
  proofUrl?: string;
  /** Why the proof was skipped, when it was. */
  proofError?: string;
}

/** Format a case number for a user-facing reply, e.g. " Case #0007." */
export function caseTag(result: CaseResult): string {
  return result.recorded
    ? ` Case #${String(result.number).padStart(4, "0")}.`
    : "";
}

/**
 * Record a case, DM the target, and post to the mod-log channel.
 * Returns the case number. DM/log failures never block the action itself.
 */
export async function createCase(params: NewCase): Promise<CaseResult> {
  const { guild, action, target, moderatorId, reason, durationMin, proof } = params;

  // Case logging is off: the ban/kick/warn itself still happens (the caller has
  // already decided to act, and refusing here would silently break the command),
  // it just leaves no record, no DM and no mod-log entry. Gating here rather
  // than at each of the seven call sites means a new mod command cannot forget.
  const cfg = await moderationConfig(guild.id);
  if (!cfg.casesEnabled) {
    return { number: 0, recorded: false };
  }

  const number = await nextCaseNumber(guild.id);

  let stored: { token: string; data: string; contentType: string; url?: string } | null =
    null;
  let proofError: string | undefined;
  if (proof) {
    const result = await fetchProof(proof);
    if ("error" in result) proofError = result.error;
    else stored = result;
  }

  await prisma.modCase.create({
    data: {
      guildId: guild.id,
      number,
      action,
      userId: target.id,
      userTag: target.tag,
      moderatorId,
      reason: reason ?? null,
      durationMin: durationMin ?? null,
      proofToken: stored?.token ?? null,
      proofData: stored?.data ?? null,
      proofContentType: stored?.contentType ?? null,
    },
  });

  const style = ACTION_STYLE[action];
  const durationText = durationMin ? ` for ${formatMinutes(durationMin)}` : "";
  const proofUrl = stored?.url;
  const mod = await moderationConfig(guild.id);

  // DM the member (best effort; closed DMs are normal), unless the server turned
  // action DMs off.
  if (mod.dmOnAction) {
    await target
      .send(
        `${style.emoji} You were ${style.verb}${durationText} in **${guild.name}**.` +
          (reason ? `\nReason: ${reason}` : "") +
          (proofUrl ? `\nProof: ${proofUrl}` : "") +
          `\nCase #${String(number).padStart(4, "0")}`,
      )
      .catch(() => {});
  }

  // Mod-log embed, with the proof image shown inline when available.
  try {
    if (mod.logChannelId) {
      const channel = guild.channels.cache.get(mod.logChannelId);
      if (channel?.isSendable()) {
        const embed = new EmbedBuilder()
          .setColor(style.color)
          .setTitle(`${style.emoji} ${action} | Case #${String(number).padStart(4, "0")}`)
          .addFields(
            { name: "Member", value: `<@${target.id}> (${target.tag})`, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            ...(durationMin
              ? [{ name: "Duration", value: formatMinutes(durationMin), inline: true }]
              : []),
            { name: "Reason", value: reason || "No reason provided" },
          )
          .setTimestamp();
        if (proofUrl) {
          embed.setImage(proofUrl).addFields({ name: "Proof", value: proofUrl });
        }
        // No dashboard URL configured: attach the image directly instead.
        const files =
          stored && !proofUrl
            ? [
                {
                  attachment: Buffer.from(stored.data, "base64"),
                  name: `proof-case-${number}.${stored.contentType.split("/")[1]}`,
                },
              ]
            : [];
        await channel.send({ embeds: [embed], files });
      }
    }
  } catch (err) {
    log.warn(`Case log post failed: ${String(err)}`);
  }

  return { number, recorded: true, proofUrl, proofError };
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

/** A user's most recent cases plus per-action counts. */
export async function userHistory(guildId: string, userId: string) {
  const [cases, counts] = await Promise.all([
    prisma.modCase.findMany({
      where: { guildId, userId },
      orderBy: { number: "desc" },
      take: 10,
    }),
    prisma.modCase.groupBy({
      by: ["action"],
      where: { guildId, userId },
      _count: true,
    }),
  ]);
  return { cases, counts };
}

export function getCase(guildId: string, number: number) {
  return prisma.modCase.findUnique({
    where: { guildId_number: { guildId, number } },
  });
}

export function deleteCase(guildId: string, number: number) {
  return prisma.modCase.delete({
    where: { guildId_number: { guildId, number } },
  });
}

export { ACTION_STYLE };
