import { tmpdir } from "node:os";
import { createWorker, type Worker } from "tesseract.js";
import type { Message } from "discord.js";
import type { ModerationConfig } from "@rukus/shared";
import { log } from "../../lib/logger.js";
import { imageScamScore } from "./imageScamScore.js";
import type { SpamHit } from "./antiSpam.js";

/**
 * Reads the text INSIDE posted images (OCR) to catch scams posted as a gallery
 * of screenshots, which carry no typed text and so slip past every other check.
 *
 * Costs are bounded on purpose, because OCR is the heaviest thing the bot does:
 * one shared worker, jobs run one at a time, a queue cap that drops work rather
 * than backing up during a flood, at most MAX_IMAGES per post, a size cap, and
 * a per-image timeout. Any failure means "not a scam", never a punishment.
 *
 * Forwarded messages are NOT scanned, and that is deliberate: forwarding a scam
 * to the mods is how members REPORT it, and punishing the reporter is exactly
 * the wrongful-punishment case this has to avoid. (A forward's images live in
 * messageSnapshots, not attachments, so they never reach this code.)
 */

const MAX_IMAGES = 4;
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 20_000;
const MAX_QUEUE = 20;

let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;

function getWorker(): Promise<Worker> {
  // Language data is cached in the temp dir, not the working directory, so a
  // deploy does not ship or commit a 10MB file.
  workerPromise ??= createWorker("eng", undefined, { cachePath: tmpdir() }).catch((err) => {
    workerPromise = null; // let the next scan retry instead of wedging forever
    throw err;
  });
  return workerPromise;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Image attachments on the message itself, largest first is not needed: order is fine. */
function imageAttachments(message: Message<true>) {
  return [...message.attachments.values()].filter(
    (a) => (a.contentType ?? "").startsWith("image/") && a.size <= MAX_BYTES,
  );
}

/** Should this message be OCR-scanned at all? Cheap checks only. */
export function shouldScan(message: Message<true>, config: ModerationConfig): boolean {
  if (!config.scanImagesForScams) return false;
  return imageAttachments(message).length >= config.imageScanMinImages;
}

async function ocrMessage(message: Message<true>): Promise<SpamHit | null> {
  const worker = await getWorker();
  let text = "";
  for (const att of imageAttachments(message).slice(0, MAX_IMAGES)) {
    const res = await withTimeout(worker.recognize(att.url), IMAGE_TIMEOUT_MS).catch(() => null);
    if (!res) continue;
    text += ` ${res.data.text}`;
    // Stop as soon as the gallery so far is conclusive: no need to read the rest.
    const score = imageScamScore(text);
    if (score.scam) {
      return {
        reason: "scam images",
        messages: [{ channelId: message.channelId, messageId: message.id }],
        evidence: `Text found in the images: ${score.matched.join(", ")}`,
      };
    }
  }
  return null;
}

/**
 * Queue an OCR scan. Resolves to a hit, or null when clean, skipped, or failed.
 * Never throws: a broken OCR must not break message handling.
 */
export function scanImages(message: Message<true>): Promise<SpamHit | null> {
  if (pending >= MAX_QUEUE) {
    log.warn(`Image scan queue full, skipping message ${message.id}.`);
    return Promise.resolve(null);
  }
  pending++;
  const job = queue.then(() => ocrMessage(message)).catch((err) => {
    log.warn(`Image scan failed for ${message.id}: ${String(err)}`);
    return null;
  }).finally(() => { pending--; });
  queue = job;
  return job;
}
