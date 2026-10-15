import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { cardChecksum, decodeStatCard } from "../src/features/build-a-house/card.js";
import { recognizeStatCard, stopStatCardReader } from "../src/features/build-a-house/ocr.js";

test("a rendered stat card passes through the actual image reader and decoder", { skip: !process.env.TEST_CARD_OCR, timeout: 60000 }, async () => {
  const stamp = BigInt(Math.floor(Date.now() / 1000));
  const values = [112345678n, 923456789n, 402n, 1800000n, 3661n, 450000n, stamp];
  const lines = ["BUILD A HOUSE LEADERBOARD", "PLAYER ExamplePlayer", "BAH1", "ID 112345678 923456789", "COLLECTION 402", "HOME 1800000", "PLAYTIME 3661", "GOLD 450000", `STAMP ${stamp}`, `CHECK ${cardChecksum(values)}`];
  const canvas = createCanvas(1000, 650);
  const context = canvas.getContext("2d");
  context.fillStyle = "#f5f5e5";
  context.fillRect(0, 0, 1000, 650);
  context.fillStyle = "black";
  context.font = "30px Arial";
  lines.forEach((line, index) => context.fillText(line, 40, 55 + index * 48));
  try {
    const read = await recognizeStatCard(canvas.toBuffer("image/png"));
    const card = decodeStatCard(read);
    assert.equal(card.collection, 402);
    assert.equal(card.homeValue, 1800000n);
    assert.equal(card.goldBalance, 450000n);
  } finally { await stopStatCardReader(); }
});
