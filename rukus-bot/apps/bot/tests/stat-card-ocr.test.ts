import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { cardChecksum, decodeStatCard, encodeGroupedCard } from "../src/features/build-a-house/card.js";
import { recognizeStatCard, stopStatCardReader } from "../src/features/build-a-house/ocr.js";

test("a rendered stat card passes through the actual image reader and decoder", { skip: !process.env.TEST_CARD_OCR, timeout: 60000 }, async () => {
  const stamp = BigInt(Math.floor(Date.now() / 1000));
  const values = [112345678n, 923456789n, 402n, 1800000n, 3661n, 450000n, stamp];
  const lines = ["BUILD A HOUSE LEADERBOARD", "PLAYER ExamplePlayer", "BAH3DATA", "ID 112345678 923456789", "COLLECTION 402", "HOME 1800000", "LIKES 3661", "GOLD 450000", `STAMP ${stamp}`, `CHECK ${cardChecksum(values)}`];
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

test("centered username and grouped letter-number codes decode from a rendered card", { skip: !process.env.TEST_CARD_OCR, timeout: 60000 }, async () => {
  const stamp = BigInt(Math.floor(Date.now() / 1000));
  const values = [112345678n, 923456789n, 402n, 1800000n, 3661n, 450000n, stamp];
  const lines = encodeGroupedCard([...values, cardChecksum(values)]).split("\n");
  const canvas = createCanvas(1000, 690);
  const context = canvas.getContext("2d");
  context.fillStyle = "#bbae70";
  context.fillRect(0, 0, 1000, 690);
  context.fillStyle = "#163f30";
  context.fillRect(4, 4, 992, 682);
  context.fillStyle = "#ffffff";
  context.font = "30px Arial";
  context.textAlign = "center";
  context.fillText("BUILD A HOUSE LEADERBOARD", 500, 60);
  context.fillText("ExamplePlayer", 500, 135);
  context.fillStyle = "#f5f5e5";
  context.fillRect(40, 176, 920, 354);
  context.fillStyle = "#000000";
  context.font = "34px Arial";
  lines.forEach((line, index) => context.fillText(line, 500, 286 + index * 44));
  try {
    const read = await recognizeStatCard(canvas.toBuffer("image/png"));
    let card;
    try { card = decodeStatCard(read); } catch (error) { throw new Error(`${String(error)}\nOCR output: ${read}`); }
    assert.equal(card.goldBalance, 450000n);
    assert.equal(card.homeValue, 1800000n);
    assert.equal(card.displayName, "ExamplePlayer");
  } finally { await stopStatCardReader(); }
});


test("whole-game screenshot with heavy code lettering uses the machine strip", { skip: !process.env.TEST_CARD_OCR, timeout: 60000 }, async () => {
  const { screenshotWithStrip } = await import("./fixtures/stat-card.js");
  const { image } = screenshotWithStrip();
  try {
    const text = await recognizeStatCard(image.toBuffer("image/png"));
    const card = decodeStatCard(text);
    assert.equal(card.goldBalance, 2316918508n);
    assert.equal(card.homeValue, 166907559750n);
    assert.equal(card.collection, 1024);
    assert.equal(card.displayName, "Rukus");
  } finally { await stopStatCardReader(); }
});
