export const BAH_SUBMIT_ID = "bah:submit";
export const BAH_UPLOAD_ID = "bah:upload";
export const BAH_FILE_ID = "bah:photo";

export function buildAHouseSubmissionPanel() {
  return {
    embeds: [{ title: "Build A House Leaderboard", color: 0x81947a,
      image: { url: "https://raw.githubusercontent.com/Xiylah/rukus-bot/main/rukus-bot/apps/web/public/build-a-house/stat-card-guide-v3.png" },
      description: "**Submit your stat card**\n\n1. Open your leaderboard stat card in Build A House.\n2. Take a clear screenshot with the whole card visible.\n3. Press **Submit Stat Card** below and upload your PNG or JPEG.\n\nYour collection, home value, house likes and saved gold balance will update after the card is read.",
      footer: { text: "One image per submission • Maximum 8 MB • One successful update every 24 hours" } }],
    components: [{ type: 1, components: [{ type: 2, custom_id: BAH_SUBMIT_ID, label: "Submit Stat Card", emoji: { name: "📸" }, style: 3 }] }],
    allowed_mentions: { parse: [] },
  };
}

export function leaderboardWeek(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  const localDate = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  localDate.setUTCDate(localDate.getUTCDate() - localDate.getUTCDay());
  return localDate.toISOString().slice(0, 10);
}
