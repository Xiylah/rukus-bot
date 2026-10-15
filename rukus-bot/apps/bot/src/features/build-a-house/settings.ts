import { BUILD_A_HOUSE_GUILD_ID } from "@rukus/shared";
export { BUILD_A_HOUSE_GUILD_ID };
export const BUILD_A_HOUSE_TITLE = "Build A House Leaderboard";

export function isBuildAHouseGuild(guildId: string | null): boolean {
  return guildId === BUILD_A_HOUSE_GUILD_ID;
}

export const leaderboardMetrics = {
  collection: "Collection",
  homeValue: "Home value",
  houseLikes: "House likes",
  goldBalance: "Gold balance",
} as const;

export type LeaderboardMetric = keyof typeof leaderboardMetrics;

export function isLeaderboardMetric(value: string): value is LeaderboardMetric {
  return Object.hasOwn(leaderboardMetrics, value);
}

export function formatLeaderboardValue(metric: LeaderboardMetric, value: bigint | number): string {
  const integer = BigInt(value);
  const formatted = integer.toLocaleString("en-US");
  return metric === "homeValue" || metric === "goldBalance"
    ? `$${formatted}` : metric === "houseLikes" ? `${formatted} likes` : `${formatted} collected`;
}
