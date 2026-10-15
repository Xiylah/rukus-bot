import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { isolateStatCardCodes } from "../src/features/build-a-house/card-image.js";
import { decodeStatCard } from "../src/features/build-a-house/card.js";

import { screenshotWithStrip } from "./fixtures/stat-card.js";

test("machine strip decodes a whole-screen heavy-font card at multiple scales and JPEG compression", async () => {
  for (const scale of [1, 2 / 3, 0.5, 1.5]) {
    const { image } = screenshotWithStrip(scale);
    for (const bytes of [image.toBuffer("image/png"), image.toBuffer("image/jpeg", 80)]) {
      const panel = await isolateStatCardCodes(bytes);
      assert.ok(panel?.machineText, `strip missing at scale ${scale}`);
      const card = decodeStatCard(panel.machineText);
      assert.equal(card.collection, 1024);
      assert.equal(card.homeValue, 166907559750n);
      assert.equal(card.goldBalance, 2316918508n);
      assert.equal(card.houseLikes, 41n);
      assert.equal(card.cardId, "112345678923456789");
    }
  }
});

test("unmarked panels and ordinary images are not treated as encoded strips", async () => {
  const image = createCanvas(1000, 690), ctx = image.getContext("2d");
  ctx.fillStyle = "#123342"; ctx.fillRect(0, 0, 1000, 690);
  assert.equal(await isolateStatCardCodes(image.toBuffer("image/png")), null);
  ctx.fillStyle = "#fbf8ef"; ctx.fillRect(40, 176, 920, 354);
  assert.equal((await isolateStatCardCodes(image.toBuffer("image/png")))?.machineText, null);
});

test("a corrupted strip is rejected by the existing card checksum", async () => {
  const { image } = screenshotWithStrip();
  const ctx = image.getContext("2d");
  const color = ctx.getImageData(1212, 695, 1, 1).data[0]!;
  ctx.fillStyle = color < 130 ? "#fbf8ef" : "black";
  ctx.fillRect(1208, 691, 8, 8);
  const panel = await isolateStatCardCodes(image.toBuffer("image/png"));
  assert.ok(panel?.machineText);
  assert.throws(() => decodeStatCard(panel.machineText!), /didn't read correctly/);
});
