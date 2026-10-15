import assert from "node:assert/strict";
import test from "node:test";
import { cardChecksum, decodeStatCard, validateCardUpdate } from "../src/features/build-a-house/card.js";

const fixture = "PLAYER ExamplePlayer\nBAH1\nID 112345678 923456789\nCOLLECTION 402\nHOME 9007199254740993\nPLAYTIME 3661\nGOLD 50\nSTAMP 1792087200\nCHECK 61889";
const now = 1792087200 * 1000;

test("Verse payload checksum and full integer gold values decode", () => {
  assert.equal(cardChecksum([112345678n, 923456789n, 402n, 9007199254740993n, 3661n, 50n, 1792087200n]), 61889n);
  const card = decodeStatCard(fixture, now);
  assert.equal(card.homeValue, 9007199254740993n);
  assert.equal(card.goldBalance, 50n);
  assert.equal(card.cardId, "112345678923456789");
  assert.equal(card.displayName, "ExamplePlayer");
});

test("damaged, duplicated, expired, future, negative and oversized cards are rejected", () => {
  assert.throws(() => decodeStatCard(fixture.replace("GOLD 50", "GOLD 51"), now), /read correctly/);
  assert.throws(() => decodeStatCard(fixture + "\nGOLD 50", now), /GOLD/);
  assert.throws(() => decodeStatCard(fixture, now + 86401000), /expired/);
  assert.throws(() => decodeStatCard(fixture, now - 301000), /invalid time/);
  assert.throws(() => decodeStatCard(fixture.replace("GOLD 50", "GOLD -1"), now));
  assert.throws(() => decodeStatCard(fixture.replace("GOLD 50", "GOLD 99999999999999999999"), now), /too large/);
});

test("fresh cards can reduce gold and home value but cannot swap identity or roll back playtime", () => {
  const card = decodeStatCard(fixture, now);
  const previous = { ...card, goldBalance: 1000n, homeValue: 9999999999999999n, capturedAt: new Date(now - 1000) };
  assert.doesNotThrow(() => validateCardUpdate(previous, card));
  assert.throws(() => validateCardUpdate({ ...previous, cardId: "another" }, card), /another card identity/);
  assert.throws(() => validateCardUpdate({ ...previous, capturedAt: card.capturedAt }, card), /already submitted/);
  assert.throws(() => validateCardUpdate({ ...previous, playtimeSeconds: 99999n }, card), /Playtime/);
});
