import { getSupabase } from "./index.js";

/**
 * Dashboard reads for the contest entry gallery.
 *
 * Not in config.ts: that file is exclusively the FeatureConfig JSON blob table.
 * Contest and ContestEntry are real per-guild data, so they get their own door,
 * the same way leveling.ts does for MemberLevel.
 *
 * The bot writes these rows through Prisma; the dashboard reads them here and
 * only ever deletes an entry (disqualification).
 */

export interface ContestRow {
  id: string;
  title: string;
  description: string;
  channelIds: string[];
  winnerCount: number;
  endsAt: string;
  ended: boolean;
  winnerIds: string[];
  createdAt: string;
}

export interface ContestEntryRow {
  id: string;
  contestId: string;
  channelId: string;
  messageId: string;
  userId: string;
  mediaUrl: string;
  votes: number;
  createdAt: string;
}

const CONTEST_COLUMNS =
  "id, title, description, channelIds, winnerCount, endsAt, ended, winnerIds, createdAt";

/** Rows straight from PostgREST, before we fill in the nullable columns. */
type RawContest = Partial<ContestRow> & { id: string };

function toContest(row: RawContest): ContestRow {
  return {
    id: row.id,
    title: row.title ?? "",
    description: row.description ?? "",
    channelIds: row.channelIds ?? [],
    winnerCount: row.winnerCount ?? 0,
    endsAt: row.endsAt ?? "",
    ended: row.ended ?? false,
    winnerIds: row.winnerIds ?? [],
    createdAt: row.createdAt ?? "",
  };
}

/**
 * The contest currently running in this guild, or null.
 *
 * Mirrors the bot's activeContestFor: not ended AND not past its end time. A
 * row that is past its end but not yet swept is deliberately NOT shown as
 * running, so the dashboard never offers to disqualify from a contest that is
 * seconds from being decided.
 */
export async function getRunningContest(
  guildId: string,
): Promise<ContestRow | null> {
  const { data, error } = await getSupabase()
    .from("Contest")
    .select(CONTEST_COLUMNS)
    .eq("guildId", guildId)
    .eq("ended", false)
    .gt("endsAt", new Date().toISOString())
    .order("createdAt", { ascending: false })
    .limit(1);

  // A missing table (migration not run yet) must not 500 the settings page the
  // admin came here to edit; an empty gallery is the honest degraded view.
  if (error || !data?.[0]) return null;
  return toContest(data[0] as RawContest);
}

/** Finished contests, newest first, for the results history. */
export async function getPastContests(
  guildId: string,
  limit = 10,
): Promise<ContestRow[]> {
  const { data, error } = await getSupabase()
    .from("Contest")
    .select(CONTEST_COLUMNS)
    .eq("guildId", guildId)
    .eq("ended", true)
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []).map((r) => toContest(r as RawContest));
}

/**
 * Delete a finished contest and its entries.
 *
 * Only ended contests: deleting a running one would leave members posting into
 * a contest the bot has forgotten, with their entries silently going nowhere.
 * Ending it first is the deliberate step that makes the delete safe.
 *
 * Entries go first. If the contest row went first and the entry delete then
 * failed, the entries would be orphaned with no contest left to find them by.
 */
export async function deletePastContest(
  guildId: string,
  contestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase();

  const entries = await sb
    .from("ContestEntry")
    .delete()
    .eq("guildId", guildId)
    .eq("contestId", contestId);
  if (entries.error) return { ok: false, error: entries.error.message };

  // eq("ended", true) is the guard, not a filter: a delete that races a still
  // running contest matches nothing rather than removing it.
  const { data, error } = await sb
    .from("Contest")
    .delete()
    .eq("guildId", guildId)
    .eq("id", contestId)
    .eq("ended", true)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "That contest is still running, or is already gone." };
  }
  return { ok: true };
}

/** Every entry of one contest, most-voted first. */
export async function getContestEntries(
  guildId: string,
  contestId: string,
  limit = 200,
): Promise<ContestEntryRow[]> {
  const { data, error } = await getSupabase()
    .from("ContestEntry")
    .select("id, contestId, channelId, messageId, userId, mediaUrl, votes, createdAt")
    // Filter on guildId as well as contestId: the contest id reaches us from
    // the page's own query, but scoping every read by guild is what stops a
    // mistake elsewhere turning into a cross-guild leak.
    .eq("guildId", guildId)
    .eq("contestId", contestId)
    .order("votes", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    contestId: r.contestId,
    channelId: r.channelId,
    messageId: r.messageId,
    userId: r.userId,
    mediaUrl: r.mediaUrl ?? "",
    votes: r.votes ?? 0,
    createdAt: r.createdAt,
  }));
}

/**
 * Disqualify an entry by deleting its row.
 *
 * Deleting is the point: an entry that does not exist cannot be counted or
 * win. The member's original message is left alone, because removing someone's
 * post is a moderation decision the dashboard should not make silently.
 */
export async function deleteContestEntry(
  guildId: string,
  entryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Scope the delete by guildId as well as id: the id comes from the client,
  // and without the guild filter a staff member of one server could delete an
  // entry belonging to another.
  const { error } = await getSupabase()
    .from("ContestEntry")
    .delete()
    .eq("guildId", guildId)
    .eq("id", entryId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
