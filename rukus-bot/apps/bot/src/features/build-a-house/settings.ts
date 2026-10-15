import { BUILD_A_HOUSE_GUILD_ID } from "@rukus/shared";
export { BUILD_A_HOUSE_GUILD_ID };
export const BUILD_A_HOUSE_TITLE = "Build A House Leaderboard";

export function isBuildAHouseGuild(guildId: string | null): boolean {
  return guildId === BUILD_A_HOUSE_GUILD_ID;
}

export const leaderboardMetrics = {
  collection: "Collection",
  homeValue: "Home value",
  playtimeSeconds: "Playtime",
  goldBalance: "Gold balance",
} as const;

export type LeaderboardMetric = keyof typeof leaderboardMetrics;

export function isLeaderboardMetric(value: string): value is LeaderboardMetric {
  return Object.hasOwn(leaderboardMetrics, value);
}

export function formatLeaderboardValue(metric: LeaderboardMetric, value: bigint | number): string {
  const integer = BigInt(value);
  if (metric === "playtimeSeconds") {
    return `${integer / 3600n}h ${(integer % 3600n) / 60n}m`;
  }
  const formatted = integer.toLocaleString("en-US");
  return metric === "homeValue" || metric === "goldBalance"
    ? `$${formatted}` : `${formatted} collected`;
}
