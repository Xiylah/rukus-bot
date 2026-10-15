import { recognizeStatCard } from "./ocr.js";
import { prisma, Prisma, getBuildAHouseConfig } from "@rukus/db";
import type { Attachment, Message } from "discord.js";
import { log } from "../../lib/logger.js";
import { BUILD_A_HOUSE_GUILD_ID, formatLeaderboardValue } from "./settings.js";
import { CardError, decodeStatCard, validateCardUpdate, validateSubmissionCooldown, canReplaceLinkedCard, type StatCard } from "./card.js";

const MAX_BYTES = 8 * 1024 * 1024;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
let configUntil = 0;
let configuredChannel: string | undefined;
const cooldowns = new Map<string, number>();

export async function downloadStatCardImage(attachment: Attachment): Promise<Buffer> {
  if (!attachment.width || !attachment.height || attachment.width * attachment.height > 20_000_000 || attachment.size > MAX_BYTES || !["image/png", "image/jpeg"].includes(attachment.contentType ?? "")) {
    throw new CardError("Upload one PNG or JPEG screenshot/photo, up to 8 MB and 20 megapixels.");
  }
  const url = new URL(attachment.url);
  if (url.protocol !== "https:" || url.port || url.username || url.password || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) || !["/attachments/", "/ephemeral-attachments/"].some((path) => url.pathname.startsWith(path))) {
    throw new CardError("Please upload the image directly to Discord.");
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new CardError("Couldn't download the image. Please upload it again.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new CardError("The screenshot is too large.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks);
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new CardError("Please upload an actual PNG or JPEG image.");
  return bytes;
}



export async function submissionResetAt(db: Pick<Prisma.TransactionClient, "featureConfig"> = prisma): Promise<number> {
  const row = await db.featureConfig.findUnique({ where: { guildId_feature: {
    guildId: BUILD_A_HOUSE_GUILD_ID, feature: "buildahouse-submission-reset",
  } } });
  const resetAt = (row?.config as { resetAt?: unknown } | null)?.resetAt;
  const timestamp = typeof resetAt === "string" ? Date.parse(resetAt) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function cardReplacementRequest(userId: string, db: Pick<Prisma.TransactionClient, "featureConfig"> = prisma) {
  const row = await db.featureConfig.findUnique({ where: { guildId_feature: {
    guildId: BUILD_A_HOUSE_GUILD_ID, feature: `buildahouse-relink:${userId}`,
  } } });
  return row?.config;
}

async function saveCard(actor: { userId: string; displayName: string }, card: StatCard): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const owner = await tx.buildAHouseStats.findUnique({ where: { guildId_cardId: { guildId: BUILD_A_HOUSE_GUILD_ID, cardId: card.cardId } } });
        if (owner && owner.userId !== actor.userId) throw new CardError("This card is already linked to another Discord account.");
        const where = { guildId_userId: { guildId: BUILD_A_HOUSE_GUILD_ID, userId: actor.userId } };
        const previous = await tx.buildAHouseStats.findUnique({ where });
        const resetAt = await submissionResetAt(tx);
        const grant = await cardReplacementRequest(actor.userId, tx);
        const approvedRelink = previous?.cardId !== card.cardId && canReplaceLinkedCard(previous, grant);
        validateCardUpdate(previous, card, Date.now(), resetAt, approvedRelink);
        const data = {
          cardId: card.cardId, collection: card.collection, homeValue: card.homeValue,
          houseLikes: card.houseLikes, goldBalance: card.goldBalance,
          fortniteDisplayName: card.displayName ?? actor.displayName.slice(0, 64),
          capturedAt: card.capturedAt, submittedAt: new Date(Math.max(Date.now(), resetAt)),
        };
        await tx.buildAHouseStats.upsert({ where, create: { guildId: BUILD_A_HOUSE_GUILD_ID, userId: actor.userId, ...data }, update: data });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 2) continue;
      throw error;
    }
  }
}

export async function submitStatCard(input: {
  userId: string; displayName: string; channelId: string; attachment: Attachment;
  reply: (content: string) => Promise<unknown>; ensureSource?: () => Promise<unknown>;
}): Promise<void> {
  if (pending >= 4 || (cooldowns.get(input.userId) ?? 0) > Date.now()) {
    await input.reply("Please wait a moment before submitting another card."); return;
  }
  for (const [id, until] of cooldowns) if (until < Date.now()) cooldowns.delete(id);
  cooldowns.set(input.userId, Date.now() + 15000);
  pending++;
  const job = queue.then(async () => {
    try {
      const previous = await prisma.buildAHouseStats.findUnique({
        where: { guildId_userId: { guildId: BUILD_A_HOUSE_GUILD_ID, userId: input.userId } },
        select: { submittedAt: true, cardId: true },
      });
      const grant = await cardReplacementRequest(input.userId);
      if (!canReplaceLinkedCard(previous, grant)) validateSubmissionCooldown(previous, Date.now(), await submissionResetAt());
      const bytes = await downloadStatCardImage(input.attachment);
      const card = decodeStatCard(await recognizeStatCard(bytes));
      const config = await getBuildAHouseConfig(BUILD_A_HOUSE_GUILD_ID);
      if (config.submissionChannelId !== input.channelId) throw new CardError("The submission channel changed. Please use the new channel.");
      await input.ensureSource?.();
      await saveCard(input, card);
      await input.reply(`Your Build A House stats are saved!\nCollection: ${card.collection}\nHome value: ${formatLeaderboardValue("homeValue", card.homeValue)}\nHouse likes: ${formatLeaderboardValue("houseLikes", card.houseLikes)}\nGold balance: ${formatLeaderboardValue("goldBalance", card.goldBalance)}\nUse /leaderboard to see the rankings. You can update your stats again in 24 hours.`);
    } catch (error) {
      log.warn("Build A House stat-card processing failed", error);
      await input.reply(error instanceof CardError ? error.message.slice(0, 600) : "Couldn't save the card right now. Please try again later.").catch(() => {});
    } finally { pending--; }
  });
  queue = job.catch((error) => log.error("Build A House upload queue failed", error));
  await job;
}

export async function handleStatCardUpload(message: Message<true>): Promise<boolean> {
  if (message.guildId !== BUILD_A_HOUSE_GUILD_ID || message.author.bot || message.webhookId || message.attachments.size === 0) return false;
  try {
    if (Date.now() >= configUntil) {
      configuredChannel = (await getBuildAHouseConfig(BUILD_A_HOUSE_GUILD_ID)).submissionChannelId;
      configUntil = Date.now() + 5000;
    }
    if (!configuredChannel || message.channelId !== configuredChannel) return false;
    const reply = (content: string) => message.reply({ content, allowedMentions: { parse: [], repliedUser: false } });
    if (message.attachments.size !== 1) { await reply("Upload one stat-card image at a time."); return true; }
    void submitStatCard({ userId: message.author.id, displayName: message.member?.displayName ?? message.author.username,
      channelId: message.channelId, attachment: message.attachments.first()!, reply,
      ensureSource: () => message.channel.messages.fetch(message.id),
    }).catch((error) => log.warn("Build A House submission failed", error));
    return true;
  } catch (error) {
    log.warn("Build A House upload configuration failed", error); return false;
  }
}
