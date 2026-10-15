import assert from "node:assert/strict";
import test from "node:test";
import { formatLeaderboardValue, isBuildAHouseGuild, isLeaderboardMetric } from "../src/features/build-a-house/settings.js";

test("Build A House routing is restricted to the requested Discord server", () => {
  assert.equal(isBuildAHouseGuild("700382994946588814"), true);
  for (const guild of [null, "700382994946588815", "", "7003829949465888140"]) {
    assert.equal(isBuildAHouseGuild(guild), false);
  }
});

test("only supported stats can be used as database sort fields", () => {
  for (const stat of ["collection", "homeValue", "playtimeSeconds", "goldBalance"]) {
    assert.equal(isLeaderboardMetric(stat), true);
  }
  for (const stat of ["__proto__", "constructor", "xp", "userId"]) {
    assert.equal(isLeaderboardMetric(stat), false);
  }
});

test("large money totals keep their precision and playtime uses seconds", () => {
  assert.equal(formatLeaderboardValue("goldBalance", 9007199254740993n), "$9,007,199,254,740,993");
  assert.equal(formatLeaderboardValue("homeValue", 123456n), "$123,456");
  assert.equal(formatLeaderboardValue("collection", 402), "402 collected");
  assert.equal(formatLeaderboardValue("playtimeSeconds", 3661n), "1h 1m");
});
