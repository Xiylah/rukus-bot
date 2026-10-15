import test from "node:test";
import assert from "node:assert/strict";
import { buildAHouseSubmissionPanel, leaderboardWeek, BAH_SUBMIT_ID, BAH_FILE_ID, buildAHouseConfigSchema } from "@rukus/shared";
import { statCardUploadModal } from "../src/features/build-a-house/interactions.js";
import { weeklyEmbed, refreshWeeklyLeaderboard } from "../src/features/build-a-house/weekly.js";
import { leaderboardMetrics, type LeaderboardMetric } from "../src/features/build-a-house/settings.js";

test("submission button opens a modal with exactly one required file", () => {
  const panel = buildAHouseSubmissionPanel();
  assert.equal(panel.components[0].components[0].custom_id, BAH_SUBMIT_ID);
  assert.equal(panel.components[0].components[0].style, 3);
  const modal = statCardUploadModal().toJSON();
  const label = modal.components[0];
  assert.equal(label.type, 18);
  assert.ok("component" in label);
  const upload = label.component;
  assert.equal(upload.type, 19);
  assert.ok("custom_id" in upload);
  assert.equal(upload.custom_id, BAH_FILE_ID);
  assert.ok("required" in upload && upload.required);
  assert.ok("min_values" in upload && upload.min_values === 1);
  assert.ok("max_values" in upload && upload.max_values === 1);
});

test("Sunday schedule respects Chicago midnight, DST and year boundaries", () => {
  assert.equal(leaderboardWeek(new Date("2026-10-18T04:59:59Z")), "2026-10-11");
  assert.equal(leaderboardWeek(new Date("2026-10-18T05:00:00Z")), "2026-10-18");
  assert.equal(leaderboardWeek(new Date("2026-11-08T05:59:59Z")), "2026-11-01");
  assert.equal(leaderboardWeek(new Date("2026-11-08T06:00:00Z")), "2026-11-08");
  assert.equal(leaderboardWeek(new Date("2027-01-01T18:00:00Z")), "2026-12-27");
});

test("four top-ten embeds stay within Discord limits and preserve large gold values", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ userId: String(700382994946588814n + BigInt(index)), fortniteDisplayName: "*".repeat(64),
    collection: 999999, homeValue: 9223372036854775807n, playtimeSeconds: 9223372036854775807n, goldBalance: 9223372036854775807n }));
  const embeds = (Object.keys(leaderboardMetrics) as LeaderboardMetric[]).map((metric) => weeklyEmbed(metric, rows, new Date()).toJSON());
  assert.equal(embeds.length, 4);
  let total = 0;
  for (const embed of embeds) {
    assert.equal(embed.description!.split("\n").length, 10);
    assert.ok(embed.description!.length <= 4096);
    for (const row of rows) assert.ok(embed.description!.includes(`<@${row.userId}>`));
    assert.ok(!embed.description!.includes(rows[0]!.fortniteDisplayName));
    total += embed.title!.length + embed.description!.length + embed.footer!.text.length;
  }
  assert.ok(total <= 6000);
  assert.ok(embeds[3].description!.includes("9,223,372,036,854,775,807"));
  assert.equal(buildAHouseConfigSchema.parse({}).leaderboardChannelId, undefined);
  assert.equal(buildAHouseConfigSchema.safeParse({ leaderboardChannelId: "invalid" }).success, false);
});


test("weekly and manual refreshes edit the same message, survive restarts and retry failures", async () => {
  const { prisma } = await import("@rukus/db");
  let state: Record<string, string> | undefined;
  let sends = 0, edits = 0, reads = 0;
  let request: { requestId: string; channelId: string } | undefined;
  let locked = true, deleted = false, denied = false;
  const channelId = "123456789012345678";
  const tx = {
    $queryRaw: async () => [{ locked }],
    featureConfig: {
      findUnique: async (args: any) => args.where.guildId_feature.feature === "buildahouse"
        ? { config: { leaderboardChannelId: channelId } }
        : args.where.guildId_feature.feature === "buildahouse-refresh-request" ? request ? { config: request } : null
        : state ? { config: state } : null,
      upsert: async (args: any) => { state = args.update.config; },
    },
    buildAHouseStats: { findMany: async (args: any) => {
      reads++; assert.equal(args.take, 10);
      assert.deepEqual(args.orderBy[1], { userId: "asc" });
      return [];
    } },
  };
  const channel = { id: channelId, guildId: "700382994946588814", isSendable: () => true,
    send: async (payload: any) => { assert.deepEqual(payload.allowedMentions, { parse: [] }); sends++; assert.equal(payload.embeds.length, 4); return { id: "message" }; },
    messages: { fetch: async () => {
      if (denied) throw { code: 50013 };
      if (deleted) throw { code: 10008 };
      return { id: "message", edit: async (payload: any) => { assert.deepEqual(payload.allowedMentions, { parse: [] }); edits++; } };
    } },
  };
  const client = { channels: { fetch: async () => channel } } as any;
  const original = prisma.$transaction;
  prisma.$transaction = (async (fn: any) => fn(tx)) as any;
  try {
    await refreshWeeklyLeaderboard(client);
    assert.equal(sends, 1); assert.equal(reads, 4);
    assert.equal(state!.week, leaderboardWeek());
    await refreshWeeklyLeaderboard(client);
    assert.equal(sends, 1); assert.equal(edits, 0); assert.equal(reads, 4);
    state!.week = "2000-01-01";
    locked = false;
    await refreshWeeklyLeaderboard(client); assert.equal(edits, 0);
    locked = true;
    await refreshWeeklyLeaderboard(client); assert.equal(edits, 1); assert.equal(sends, 1);
    state!.week = "2000-01-01"; denied = true;
    await assert.rejects(refreshWeeklyLeaderboard(client));
    assert.equal(sends, 1); assert.equal(state!.week, "2000-01-01");
    denied = false; deleted = true;
    await refreshWeeklyLeaderboard(client); assert.equal(sends, 2);
    assert.equal(state!.week, leaderboardWeek());
    deleted = false;
    request = { requestId: "manual-1", channelId };
    await refreshWeeklyLeaderboard(client);
    assert.equal(edits, 2); assert.equal(sends, 2);
    assert.equal(state!.handledRequestId, "manual-1");
    await refreshWeeklyLeaderboard(client);
    assert.equal(edits, 2);
    request = { requestId: "manual-2", channelId };
    denied = true;
    await assert.rejects(refreshWeeklyLeaderboard(client));
    assert.equal(state!.handledRequestId, "manual-1");
    denied = false;
    await refreshWeeklyLeaderboard(client);
    assert.equal(edits, 3); assert.equal(state!.handledRequestId, "manual-2");
    request = { requestId: "manual-wrong-channel", channelId: "999999999999999999" };
    await refreshWeeklyLeaderboard(client);
    assert.equal(edits, 3);
    state!.week = "2000-01-01";
    await refreshWeeklyLeaderboard(client);
    assert.equal(edits, 4); assert.equal(state!.week, leaderboardWeek());
  } finally { prisma.$transaction = original; }
});


test("leaderboard footer automatically displays CST or CDT for Central daylight saving", () => {
  for (const [date, zone] of [
    ["2026-01-11T06:00:00Z", "CST"],
    ["2026-07-12T05:00:00Z", "CDT"],
    ["2026-11-01T06:59:59Z", "CDT"],
    ["2026-11-01T08:00:00Z", "CST"],
  ]) {
    const footer = weeklyEmbed("collection", [], new Date(date!)).toJSON().footer!.text;
    assert.ok(footer.endsWith(`Refreshes Sunday, 12 AM ${zone}`));
    assert.ok(!footer.includes("America/Chicago"));
  }
});
