import { tmpdir } from "node:os";
import { createWorker, type Worker } from "tesseract.js";
import { CardError } from "./card.js";
let workerPromise: Promise<Worker> | null = null;

export async function recognizeStatCard(bytes: Buffer): Promise<string> {
  workerPromise ??= createWorker("eng", undefined, { cachePath: tmpdir() }).catch((error) => {
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
