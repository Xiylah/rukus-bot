/**
 * Flood guard for log channels.
 *
 * Every log entry is one Discord message, and Discord lets a channel take about
 * five messages every five seconds. Some actions produce events by the
 * thousand: /role all on a 6,000-member server is 6,000 "role changed" entries,
 * a server lockdown is one "channel updated" per channel, a raid ban wave is one
 * entry per ban. Without a limit those queued for hours, burying the log channel
 * and delaying every other entry behind them.
 *
 * Each destination channel may post LIMIT entries per WINDOW_MS. Past that,
 * entries are counted instead of posted, and once the burst goes quiet a single
 * summary reports how many of each kind were skipped. Normal activity is far
 * below the limit and is never affected.
 */

export const WINDOW_MS = 30_000;
export const LIMIT = 20;
/** Post the summary once nothing has been suppressed for this long. */
export const QUIET_MS = 15_000;

interface ChannelState {
  /** Send times inside the current window. */
  sent: number[];
  /** event -> how many were skipped since the last summary. */
  suppressed: Map<string, number>;
  timer?: ReturnType<typeof setTimeout>;
}

const states = new Map<string, ChannelState>();

export type SummaryFn = (counts: Map<string, number>) => void;

/**
 * Should this entry be posted? Returns false when the channel is over its
 * budget, in which case the entry is counted and `onSummary` will be called
 * with the totals once the burst ends.
 */
export function admit(
  channelKey: string,
  event: string,
  onSummary: SummaryFn,
  now: number = Date.now(),
): boolean {
  let state = states.get(channelKey);
  if (!state) {
    state = { sent: [], suppressed: new Map() };
    states.set(channelKey, state);
  }

  state.sent = state.sent.filter((t) => now - t < WINDOW_MS);
  if (state.sent.length < LIMIT && state.suppressed.size === 0) {
    state.sent.push(now);
    return true;
  }

  // Over budget (or a burst is already being summarised): count, don't post.
  state.suppressed.set(event, (state.suppressed.get(event) ?? 0) + 1);
  if (state.timer) clearTimeout(state.timer);
  const s = state;
  s.timer = setTimeout(() => {
    const counts = new Map(s.suppressed);
    s.suppressed.clear();
    s.sent = [];
    s.timer = undefined;
    onSummary(counts);
  }, QUIET_MS);
  return false;
}

/** Plain-English names for the summary. */
const LABELS: Record<string, string> = {
  messageDelete: "message deletions",
  messageEdit: "message edits",
  messageBulkDelete: "bulk deletions",
  memberJoin: "joins",
  memberLeave: "leaves",
  memberBan: "bans",
  memberUnban: "unbans",
  memberKick: "kicks",
  memberRoleChange: "role changes",
  memberNickChange: "nickname changes",
  memberAvatarChange: "avatar changes",
  channelCreate: "channels created",
  channelDelete: "channels deleted",
  channelUpdate: "channel updates",
  roleCreate: "roles created",
  roleDelete: "roles deleted",
  roleUpdate: "role updates",
  emojiUpdate: "emoji changes",
  serverUpdate: "server setting changes",
  inviteCreate: "invites created",
  inviteDelete: "invites deleted",
  voiceJoin: "voice joins",
  voiceLeave: "voice leaves",
  voiceMove: "voice moves",
};

export function summaryLines(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([event, n]) => `**${n.toLocaleString("en-US")}** ${LABELS[event] ?? event}`);
}
