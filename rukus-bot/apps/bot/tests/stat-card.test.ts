import assert from "node:assert/strict";
import test from "node:test";
import { cardChecksum, decodeStatCard, encodeGroupedCard, validateCardUpdate, validateSubmissionCooldown, STAT_CARD_UPDATE_INTERVAL_MS } from "../src/features/build-a-house/card.js";

const fixture = "PLAYER ExamplePlayer\nBAH1\nID 112345678 923456789\nCOLLECTION 402\nHOME 9007199254740993\nPLAYTIME 3661\nGOLD 50\nSTAMP 1792087200\nCHECK 61889";
const now = 1792087200 * 1000;

const grouped = "BAH2\nA GXXJ TWJE SZTF Z8T8 V4KJ\nB RY7E MU3A JQX6 DPDF 9GPW\nC 5CKS Z8FP F5YX T5CE NQHB";

test("grouped codes match the fixed-width Verse encoding and preserve the centered username", () => {
  assert.equal(encodeGroupedCard([112345678n, 923456789n, 402n, 9007199254740993n, 3661n, 50n, 1792087200n, 61889n]), grouped);
  const card = decodeStatCard(`BUILD A HOUSE LEADERBOARD\nExamplePlayer\n${grouped}`, now);
  assert.deepEqual(card, decodeStatCard(fixture, now));
});

test("incomplete, duplicate and damaged grouped code rows are rejected", () => {
  assert.throws(() => decodeStatCard(grouped.replace("NQHB", "NQHC"), now));
  assert.throws(() => decodeStatCard(grouped.replace("NQHB", "NQH"), now), /row C/);
  assert.throws(() => decodeStatCard(grouped + "\n" + grouped, now), /one whole/);
  assert.throws(() => encodeGroupedCard([1n]), /Invalid/);
});

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
  const previous = { ...card, submittedAt: new Date(now - STAT_CARD_UPDATE_INTERVAL_MS), goldBalance: 1000n, homeValue: 9999999999999999n, capturedAt: new Date(now - 1000) };
  assert.doesNotThrow(() => validateCardUpdate(previous, card, now));
  assert.throws(() => validateCardUpdate({ ...previous, cardId: "another" }, card, now), /another card identity/);
  assert.throws(() => validateCardUpdate({ ...previous, capturedAt: card.capturedAt }, card, now), /already submitted/);
  assert.throws(() => validateCardUpdate({ ...previous, playtimeSeconds: 99999n }, card, now), /Playtime/);
});


test("OCR may join a row label to its first code group without changing the payload", () => {
  const values = [112345678n, 923456789n, 402n, 1800000n, 3661n, 450000n, 1792087200n];
  const text = encodeGroupedCard([...values, cardChecksum(values)]).replace(/\n([ABC]) /g, "\n$1");
  assert.equal(decodeStatCard(text, 1792087200000).goldBalance, 450000n);
});


test("daily updates use the last successful server submission, with an exact rolling 24-hour boundary", () => {
  const card = decodeStatCard(fixture, now);
  const previous = { ...card, capturedAt: new Date(now - 1000), submittedAt: new Date(now) };
  assert.doesNotThrow(() => validateSubmissionCooldown(null, now));
  assert.throws(() => validateCardUpdate(previous, card, now), /once every 24 hours/);
  assert.throws(() => validateSubmissionCooldown(previous, now + STAT_CARD_UPDATE_INTERVAL_MS - 1), /next update.*<t:/);
  assert.doesNotThrow(() => validateSubmissionCooldown(previous, now + STAT_CARD_UPDATE_INTERVAL_MS));
  assert.doesNotThrow(() => validateCardUpdate(previous, card, now + STAT_CARD_UPDATE_INTERVAL_MS));
  const savedAfterFirstUpdate = { submittedAt: new Date(now + STAT_CARD_UPDATE_INTERVAL_MS) };
  assert.throws(() => validateSubmissionCooldown(savedAfterFirstUpdate, now + STAT_CARD_UPDATE_INTERVAL_MS + 1000), /once every 24 hours/);
});
