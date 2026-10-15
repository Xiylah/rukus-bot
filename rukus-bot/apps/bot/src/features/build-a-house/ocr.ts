import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createWorker, type Worker } from "tesseract.js";
import { CardError } from "./card.js";
let workerPromise: Promise<Worker> | null = null;

async function englishData(): Promise<string> {
  const directory = join(tmpdir(), "bah-stat-card-ocr");
  await mkdir(directory, { recursive: true });
  const cache = join(directory, "eng.traineddata");
  for (const path of [cache, join(tmpdir(), "bah-eng.traineddata"), join(tmpdir(), "eng.traineddata")]) {
    try {
      const data = await readFile(path);
      if (data.length > 100000 && data.length < 32 * 1024 * 1024) {
        if (path !== cache) await writeFile(cache, data);
        return directory;
      }
    } catch {}
  }
  const response = await fetch("https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new CardError("The image reader is starting up. Please try again shortly.");
  const compressed = Buffer.from(await response.arrayBuffer());
  if (compressed.length > 16 * 1024 * 1024) throw new Error("Invalid OCR language download");
  const data = gunzipSync(compressed, { maxOutputLength: 32 * 1024 * 1024 });
  await writeFile(cache, data);
  return directory;
}

export async function recognizeStatCard(bytes: Buffer): Promise<string> {
  workerPromise ??= englishData().then((directory) => createWorker("eng", undefined, {
    langPath: directory, cachePath: directory, gzip: false, errorHandler: () => {},
  })).catch((error) => {
    workerPromise = null;
    throw error;
  });
  const currentWorker = workerPromise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      currentWorker.then((worker) => worker.recognize(bytes)).then((result) => result.data.text),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CardError("Reading the image timed out. Try a clearer, cropped image.")), 30000);
      }),
    ]);
  } catch (error) {
    void currentWorker.then((worker) => worker.terminate()).catch(() => {});
    workerPromise = null;
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}

export async function stopStatCardReader(): Promise<void> {
  const worker = workerPromise;
  workerPromise = null;
  if (worker) await (await worker).terminate();
}
