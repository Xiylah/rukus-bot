import { recognizeStatCard } from "./ocr.js";
import { prisma, Prisma, getBuildAHouseConfig } from "@rukus/db";
import type { Attachment, Message } from "discord.js";
import { log } from "../../lib/logger.js";
import { BUILD_A_HOUSE_GUILD_ID, formatLeaderboardValue } from "./settings.js";
import { CardError, decodeStatCard, validateCardUpdate, type StatCard } from "./card.js";

const MAX_BYTES = 8 * 1024 * 1024;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
let configUntil = 0;
let configuredChannel: string | undefined;
const cooldowns = new Map<string, number>();

async function download(attachment: Attachment): Promise<Buffer> {
  if (!attachment.width || !attachment.height || attachment.width * attachment.height > 20_000_000 || attachment.size > MAX_BYTES || !["image/png", "image/jpeg"].includes(attachment.contentType ?? "")) {
    throw new CardError("Upload one PNG or JPEG screenshot/photo, up to 8 MB and 20 megapixels.");
  }
  const url = new URL(attachment.url);
  if (url.protocol !== "https:" || url.port || url.username || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) || !url.pathname.startsWith("/attachments/")) {
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



async function saveCard(message: Message<true>, card: StatCard): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const owner = await tx.buildAHouseStats.findUnique({ where: { guildId_cardId: { guildId: BUILD_A_HOUSE_GUILD_ID, cardId: card.cardId } } });
        if (owner && owner.userId !== message.author.id) throw new CardError("This card is already linked to another Discord account.");
        const where = { guildId_userId: { guildId: BUILD_A_HOUSE_GUILD_ID, userId: message.author.id } };
        const previous = await tx.buildAHouseStats.findUnique({ where });
        validateCardUpdate(previous, card);
        const data = {
          cardId: card.cardId, collection: card.collection, homeValue: card.homeValue,
          playtimeSeconds: card.playtimeSeconds, goldBalance: card.goldBalance,
          fortniteDisplayName: card.displayName ?? message.member?.displayName.slice(0, 64) ?? message.author.username,
          capturedAt: card.capturedAt, submittedAt: new Date(),
        };
        await tx.buildAHouseStats.upsert({ where, create: { guildId: BUILD_A_HOUSE_GUILD_ID, userId: message.author.id, ...data }, update: data });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 2) continue;
      throw error;
    }
  }
}

export async function handleStatCardUpload(message: Message<true>): Promise<boolean> {
  if (message.guildId !== BUILD_A_HOUSE_GUILD_ID || message.author.bot || message.webhookId || message.attachments.size === 0) return false;
  try {
    if (Date.now() >= configUntil) {
      configuredChannel = (await getBuildAHouseConfig(BUILD_A_HOUSE_GUILD_ID)).submissionChannelId;
      configUntil = Date.now() + 5000;
    }
    if (!configuredChannel || message.channelId !== configuredChannel) return false;
    if (message.attachments.size !== 1) {
      await message.reply({ content: "Upload one stat-card image at a time.", allowedMentions: { parse: [], repliedUser: false } });
      return true;
    }
    if (pending >= 4 || (cooldowns.get(message.author.id) ?? 0) > Date.now()) {
      await message.reply({ content: "Please wait a moment before submitting another card.", allowedMentions: { parse: [], repliedUser: false } });
      return true;
    }
    const attachment = message.attachments.first()!;
    for (const [id, until] of cooldowns) if (until < Date.now()) cooldowns.delete(id);
    cooldowns.set(message.author.id, Date.now() + 15000);
    pending++;
    const job = queue.then(async () => {
      try {
        const bytes = await download(attachment);
        const card = decodeStatCard(await recognizeStatCard(bytes));
        const stillConfigured = await getBuildAHouseConfig(BUILD_A_HOUSE_GUILD_ID);
        if (stillConfigured.submissionChannelId !== message.channelId) throw new CardError("The submission channel changed. Please upload in the new channel.");
        await message.channel.messages.fetch(message.id);
        await saveCard(message, card);
        await message.reply({
          content: `Your Build A House stats are saved!\nCollection: ${card.collection}\nHome value: ${formatLeaderboardValue("homeValue", card.homeValue)}\nPlaytime: ${formatLeaderboardValue("playtimeSeconds", card.playtimeSeconds)}\nGold balance: ${formatLeaderboardValue("goldBalance", card.goldBalance)}\nUse /leaderboard to see the rankings.`,
          allowedMentions: { parse: [], repliedUser: false },
        });
      } catch (error) {
        log.warn("Build A House stat-card processing failed", error);
        const safeError = error instanceof CardError
          ? error.message : "Couldn't save the card right now. Please try again later.";
        await message.reply({ content: safeError.slice(0, 600), allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
      } finally { pending--; }
    });
    queue = job.catch((error) => log.error("Build A House upload queue failed", error));
    return true;
  } catch (error) {
    log.warn("Build A House upload configuration failed", error);
    return false;
  }
}
