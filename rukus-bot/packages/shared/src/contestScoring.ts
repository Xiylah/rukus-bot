/**
 * Blending public votes with judge scores into one ranking.
 *
 * Pure and dependency-free so the awkward part (two scales that are not
 * comparable) can be reasoned about and tested without a Discord client or a
 * database.
 *
 * WHY normalise instead of adding raw numbers: a contest can draw 3 votes or
 * 300, while a judge score is always 1-10. Adding them together would make the
 * judges decisive in a quiet contest and irrelevant in a busy one, which is the
 * opposite of what judgeWeightPercent is supposed to control. Normalising each
 * side to 0-1 first means the weight means the same thing at every scale.
 */

/** The raw numbers we have for one entry before any blending. */
export interface EntryScoreInput {
  /** Anything that identifies the entry to the caller; we only pass it back. */
  id: string;
  /** Public reaction votes, already de-duplicated and self-votes dropped. */
  votes: number;
  /** Every judge's 1-10 score for this entry. Empty when nobody judged it. */
  judgeScores: number[];
  /** Tie-break: earlier posts win, a rule everyone can see. */
  createdAt: Date;
}

/** One entry's blended result, in ranked order once `rankEntries` is done. */
export interface EntryScore {
  id: string;
  votes: number;
  /** Mean of the judges' scores on the original 1-10 scale, 0 when unjudged. */
  judgeAverage: number;
  /** How many judges scored it, so the embed can say "2 judges". */
  judgeCount: number;
  /** Votes rescaled against the best-voted entry, 0-1. */
  voteScore: number;
  /** Judge average rescaled against the best-judged entry, 0-1. */
  judgeScore: number;
  /** The blend that actually decides the ranking, 0-1. */
  finalScore: number;
}

/** Judge scores are entered on a 1-10 scale; anything else is a bug or abuse. */
export const MIN_JUDGE_SCORE = 1;
export const MAX_JUDGE_SCORE = 10;

/** Mean of the judges' scores, or 0 when nobody has judged this entry. */
export function averageJudgeScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const total = scores.reduce((sum, s) => sum + s, 0);
  return total / scores.length;
}

/**
 * Rescale a value against the best value seen, giving 0-1.
 *
 * Relative to the FIELD, not to an absolute ceiling: the winner of the votes
 * gets 1.0 whether they got 3 votes or 300, which is what makes the two halves
 * of the blend comparable. When nothing scored at all (`max` is 0) everyone
 * gets 0, so an unjudged contest contributes nothing rather than dividing by
 * zero.
 */
export function normalise(value: number, max: number): number {
  if (max <= 0) return 0;
  const scaled = value / max;
  // Clamp defensively: a stale snapshot could in principle exceed the max.
  return Math.min(1, Math.max(0, scaled));
}

/**
 * Blend one entry's two normalised scores using the judge weight.
 *
 * `judgeWeightPercent` is clamped rather than trusted: it arrives from config,
 * and a value outside 0-100 would produce a negative or over-unity weight that
 * silently inverts the ranking.
 */
export function blendScore(
  voteScore: number,
  judgeScore: number,
  judgeWeightPercent: number,
): number {
  const weight = Math.min(100, Math.max(0, judgeWeightPercent)) / 100;
  return voteScore * (1 - weight) + judgeScore * weight;
}

/**
 * Rank every entry, newest maths first.
 *
 * `judgingEnabled` false reproduces the pre-judging behaviour exactly: the
 * blend collapses to votes only, so an existing server that never turns judging
 * on sees no change in who wins.
 */
export function rankEntries(
  entries: EntryScoreInput[],
  opts: { judgingEnabled: boolean; judgeWeightPercent: number },
): EntryScore[] {
  // With judging off the weight is forced to 0 rather than merely defaulted, so
  // a server that configured a weight and then disabled judging does not keep
  // being ranked by stale judge scores.
  const weight = opts.judgingEnabled ? opts.judgeWeightPercent : 0;

  const withAverages = entries.map((e) => ({
    input: e,
    judgeAverage: averageJudgeScore(e.judgeScores),
  }));

  const maxVotes = Math.max(0, ...withAverages.map((e) => e.input.votes));
  const maxJudge = Math.max(0, ...withAverages.map((e) => e.judgeAverage));

  const scored: EntryScore[] = withAverages.map((e) => {
    const voteScore = normalise(e.input.votes, maxVotes);
    const judgeScore = normalise(e.judgeAverage, maxJudge);
    return {
      id: e.input.id,
      votes: e.input.votes,
      judgeAverage: e.judgeAverage,
      judgeCount: e.input.judgeScores.length,
      voteScore,
      judgeScore,
      finalScore: blendScore(voteScore, judgeScore, weight),
    };
  });

  const createdAt = new Map(entries.map((e) => [e.id, e.createdAt.getTime()]));
  scored.sort(
    (a, b) =>
      b.finalScore - a.finalScore ||
      // A blend can tie exactly (two entries with the same votes and scores),
      // so fall through to raw votes and then to who posted first.
      b.votes - a.votes ||
      (createdAt.get(a.id) ?? 0) - (createdAt.get(b.id) ?? 0),
  );
  return scored;
}

/**
 * Does this entry have anything to show for itself?
 *
 * The old rule was "more than zero votes"; with judging on, an entry the judges
 * scored highly but nobody reacted to must still be able to place, or turning
 * judging on would quietly break the feature it was meant to fix.
 */
export function hasAnyScore(entry: EntryScore, judgingEnabled: boolean): boolean {
  if (entry.votes > 0) return true;
  return judgingEnabled && entry.judgeCount > 0;
}
