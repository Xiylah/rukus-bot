import type { AutoRule, AutoResponderConfig } from "./schemas.js";

/**
 * Auto-responder matching engine.
 *
 * Lives in @rukus/shared so the bot and the dashboard's "test a message" box
 * run the IDENTICAL code: what you see in the tester is exactly what will
 * happen in Discord. Pure functions, no Discord or DB dependencies.
 */

// ---------------- text helpers ----------------

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Levenshtein distance, capped for speed on long strings. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length]!;
}

/** Word similarity 0-1, tolerant of typos ("evnt" ~ "event"). */
function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  // Only bother with fuzzy matching for words long enough to have typos.
  if (max < 4) return 0;

  /**
   * Allow fewer typos the shorter the word is.
   *
   * A ratio alone is far too generous at the short end: "gone" vs "gold" is one
   * edit over four characters, which scores 0.75 and sails past the 0.75 accept
   * threshold, so a trigger's key word counted as present in a message that
   * never contained it ("my items are gone" scored 80% on a message about
   * houses and gold). Those are different words, not a typo.
   *
   * Length 4-5 must be exact, 6-7 allow one edit, 8+ allow two. Long words are
   * where real typos live and where an accidental collision is unlikely.
   */
  const budget = max <= 5 ? 0 : max <= 7 ? 1 : 2;
  const dist = editDistance(a, b);
  if (dist > budget) return 0;

  return Math.max(0, 1 - dist / max);
}

/**
 * Filler words that carry almost no meaning. A long message inevitably
 * contains "is", "there", "an", "the"..., so counting them as evidence made
 * unrelated paragraphs score highly against triggers like "is there an event
 * today". They still contribute a little, but the real signal is the content
 * words (event, lost, items, schedule...).
 */
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had", "will", "would", "can",
  "could", "should", "there", "here", "this", "that", "these", "those",
  "i", "you", "he", "she", "it", "we", "they", "me", "my", "your",
  "and", "or", "but", "if", "so", "of", "to", "in", "on", "at", "for",
  "with", "from", "by", "up", "out", "any", "some", "get", "got",
]);

const STOPWORD_WEIGHT = 0.25;

function wordWeight(word: string): number {
  return STOPWORDS.has(word) ? STOPWORD_WEIGHT : 1;
}

/**
 * How well a message matches one trigger phrase, 0-100.
 *
 * Two things stop long, unrelated messages from scoring highly:
 *
 * 1. WEIGHTING. Content words count fully; filler words ("is", "there", "an")
 *    count for a quarter. A rambling bug report contains plenty of filler, but
 *    it doesn't contain the trigger's *meaningful* words in the right places.
 *
 * 2. PROXIMITY. We also check how tightly the trigger's content words cluster
 *    in the message. In a real question they sit next to each other ("when is
 *    the next EVENT"); in an unrelated paragraph they're scattered across
 *    sentences. Matches whose words are spread far apart are scaled down.
 */
export function phraseScore(message: string, trigger: string): number {
  const msgWords = tokens(message);
  const trigWords = tokens(trigger);
  if (trigWords.length === 0 || msgWords.length === 0) return 0;

  let matchedWeight = 0;
  let totalWeight = 0;
  // Where each matched trigger word was found, to measure how spread out
  // the match is.
  const positions: number[] = [];

  for (const tw of trigWords) {
    const weight = wordWeight(tw);
    totalWeight += weight;

    let best = 0;
    let bestAt = -1;
    for (let i = 0; i < msgWords.length; i++) {
      const mw = msgWords[i]!;
      const sim = mw === tw ? 1 : wordSimilarity(mw, tw);
      if (sim > best) {
        best = sim;
        bestAt = i;
      }
      if (best === 1) break;
    }
    // Below 0.75 similarity we don't count the word as present at all.
    if (best >= 0.75) {
      matchedWeight += best * weight;
      // Only content words tell us anything about WHERE the match is.
      if (weight === 1 && bestAt >= 0) positions.push(bestAt);
    }
  }

  if (totalWeight === 0) return 0;
  let score = matchedWeight / totalWeight;

  /**
   * A trigger is only "present" if its CONTENT words are.
   *
   * Stopwords are everywhere, so a trigger like "my items are gone" can score
   * on `my` + `are` plus a single content word and look like a strong match
   * against a message that shares none of its meaning (a member listing their
   * houses scored 80% on it). Requiring most of the content words to actually
   * appear is what separates "the same subject" from "the same filler".
   *
   * Triggers made ENTIRELY of stopwords are left alone: there is nothing to
   * require, and the server author clearly meant those exact words.
   */
  const contentWords = trigWords.filter((w) => wordWeight(w) === 1);
  if (contentWords.length > 0) {
    // Require a majority: 1 of 1, 1 of 2, 2 of 3, 2 of 4, 3 of 5, and so on.
    const needed = Math.ceil(contentWords.length / 2);
    if (positions.length < needed) return 0;
  }

  // Proximity: how tightly did the trigger's content words cluster?
  if (positions.length >= 2) {
    positions.sort((a, b) => a - b);
    const span = positions[positions.length - 1]! - positions[0]! + 1;
    // Ideal span = the number of content words (they sit next to each other).
    // Allow generous slack (3x) before penalising, then decay.
    const ideal = positions.length * 3;
    if (span > ideal) {
      score *= Math.max(0.35, ideal / span);
    }
  }

  return Math.round(score * 100);
}

// ---------------- question detection ----------------

const QUESTION_WORDS =
  /^(what|when|where|who|why|how|which|whose|is|are|was|were|do|does|did|can|could|will|would|should|has|have|had|any|anyone|anybody)\b/i;

export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.includes("?")) return true;
  return QUESTION_WORDS.test(t);
}

// ---------------- rule matching ----------------

export interface RuleMatch {
  rule: AutoRule;
  /** 0-100 confidence for fuzzy mode; 100 for exact modes. */
  score: number;
  /** The trigger phrase that matched. */
  trigger: string;
}

export interface MatchContext {
  channelId?: string;
  roleIds?: string[];
}

/** Why a rule did NOT match, for the dashboard tester. */
export type RuleSkip =
  | "disabled"
  | "channel-not-allowed"
  | "channel-ignored"
  | "role-ignored"
  | "too-short"
  | "not-a-question"
  | "excluded"
  | "no-trigger-matched"
  | "no-triggers";

export interface RuleEvaluation {
  rule: AutoRule;
  matched: boolean;
  /** Best score achieved across all triggers (fuzzy mode). */
  score: number;
  trigger?: string;
  skip?: RuleSkip;
}

function containsPhrase(message: string, phrase: string, mode: string): boolean {
  const m = normalize(message);
  const p = normalize(phrase);
  if (!p) return false;
  if (mode === "word") {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(m);
  }
  return m.includes(p);
}

/** Evaluate ONE rule against a message, explaining the outcome. */
export function evaluateRule(
  rule: AutoRule,
  message: string,
  ctx: MatchContext = {},
): RuleEvaluation {
  const base = { rule, matched: false, score: 0 };

  if (!rule.enabled) return { ...base, skip: "disabled" };

  if (ctx.channelId) {
    if (rule.channelIds.length > 0 && !rule.channelIds.includes(ctx.channelId)) {
      return { ...base, skip: "channel-not-allowed" };
    }
    if (rule.ignoredChannelIds.includes(ctx.channelId)) {
      return { ...base, skip: "channel-ignored" };
    }
  }
  if (
    ctx.roleIds?.length &&
    rule.ignoredRoleIds.some((r) => ctx.roleIds!.includes(r))
  ) {
    return { ...base, skip: "role-ignored" };
  }

  const text = message.trim();
  if (text.length < rule.minLength) return { ...base, skip: "too-short" };
  if (rule.questionsOnly && !looksLikeQuestion(text)) {
    return { ...base, skip: "not-a-question" };
  }
  if (rule.triggers.length === 0) return { ...base, skip: "no-triggers" };

  // Exclusions veto the rule outright.
  for (const ex of rule.exclusions) {
    if (rule.matchMode === "regex") {
      try {
        if (new RegExp(ex, "i").test(text)) return { ...base, skip: "excluded" };
      } catch {
        /* invalid regex: ignore this exclusion */
      }
    } else if (containsPhrase(text, ex, "contains")) {
      return { ...base, skip: "excluded" };
    }
  }

  // Triggers.
  if (rule.matchMode === "regex") {
    for (const t of rule.triggers) {
      try {
        if (new RegExp(t, "i").test(text)) {
          return { rule, matched: true, score: 100, trigger: t };
        }
      } catch {
        /* invalid regex: skip */
      }
    }
    return { ...base, skip: "no-trigger-matched" };
  }

  if (rule.matchMode === "contains" || rule.matchMode === "word") {
    for (const t of rule.triggers) {
      if (containsPhrase(text, t, rule.matchMode)) {
        return { rule, matched: true, score: 100, trigger: t };
      }
    }
    return { ...base, skip: "no-trigger-matched" };
  }

  // Fuzzy: best score across triggers, compared to the threshold.
  let bestScore = 0;
  let bestTrigger = "";
  for (const t of rule.triggers) {
    const s = phraseScore(text, t);
    if (s > bestScore) {
      bestScore = s;
      bestTrigger = t;
    }
  }
  if (bestScore >= rule.threshold) {
    return { rule, matched: true, score: bestScore, trigger: bestTrigger };
  }
  return { ...base, score: bestScore, trigger: bestTrigger || undefined, skip: "no-trigger-matched" };
}

/**
 * Evaluate every rule; returns them all (for the dashboard tester) and the
 * winner: the highest-scoring match, first-defined wins ties.
 */
export function evaluateAll(
  config: AutoResponderConfig,
  message: string,
  ctx: MatchContext = {},
): { evaluations: RuleEvaluation[]; best?: RuleMatch } {
  const evaluations = config.rules.map((r) => evaluateRule(r, message, ctx));
  let best: RuleMatch | undefined;
  for (const e of evaluations) {
    if (!e.matched) continue;
    if (!best || e.score > best.score) {
      best = { rule: e.rule, score: e.score, trigger: e.trigger ?? "" };
    }
  }
  return { evaluations, best };
}

/** Fill {user} {server} {channel} in a response. */
export function renderResponse(
  template: string,
  vars: { userId: string; serverName: string; channelId: string },
): string {
  return template
    .replace(/\{user\}/gi, `<@${vars.userId}>`)
    .replace(/\{server\}/gi, vars.serverName)
    .replace(/\{channel\}/gi, `<#${vars.channelId}>`);
}

// ---------------- legacy migration ----------------

const LEGACY_EVENT_TRIGGERS = [
  "when is the next event",
  "any upcoming events",
  "what events are coming up",
  "is there an event this weekend",
  "when is the next update",
  "event schedule",
  "are we having an event soon",
  "when is admin abuse",
  "admin abuse this weekend",
  "is there admin abuse this week",
  "when is the next admin abuse",
  "admin abuse schedule",
  "when does admin abuse start",
  "is admin abuse happening",
  "what time is the next event",
  "is there an event today",
  "any events planned",
  "is there a live event",
];

/**
 * Words that mean the message is a bug report, complaint, or story about an
 * event, not a question asking WHEN one is. These are the false positives that
 * actually happen in a game server ("the game crashes during the event...").
 */
const LEGACY_EVENT_EXCLUSIONS = [
  "that event was fun",
  "the event already ended",
  "we just had an event",
  "there are no events",
  "will be announced",
  // bug/lag/complaint chatter
  "bug",
  "glitch",
  "crash",
  "lag",
  "broken",
  "kicked",
  "error",
  "fix",
  "issue",
  "problem",
  "stuck",
];

/**
 * Praise and hypotheticals, not a report.
 *
 * A rule about lost items cannot rely on "is it a question?": a real cry for
 * help is usually a statement ("i lost my items please help"), so requiring a
 * question silences the people who need answering. The reliable tell is the
 * other way round: someone THANKING you for how inventory works, or musing
 * about what they "won't have to" do, is not asking for anything, and those
 * phrases never appear in a genuine "my stuff is gone" message.
 *
 * This is what caught the reported false positive: "I like how ... which means
 * ... I won't have to worry about selling furniture" scored 98% against
 * "all my items are missing" on the words alone.
 */
const PRAISE_EXCLUSIONS = [
  "i like how",
  "i like that",
  "love how",
  "love that",
  "nice that",
  "good thing",
  "glad",
  "thanks for",
  "thank you for",
  "appreciate",
  "which means",
  "i wont have to",
  "i won't have to",
  "dont have to worry",
  "don't have to worry",
  "no longer have to",
];

const LEGACY_LOST_TRIGGERS = [
  "i lost my items",
  "i lost my inventory",
  "my items are gone",
  "my inventory disappeared",
  "all my items are missing",
  "my stuff disappeared",
  "i lost all my stuff",
  "my items got wiped",
  "my inventory got reset",
  "i lost my gear",
  "all my gear is gone",
  "my items vanished",
  "i cant find my items",
  "where did my items go",
  "my inventory is empty",
];

/**
 * One-time upgrade: turn the old hardcoded event/lost-item behavior into two
 * ordinary, editable rules. Returns the config unchanged when there's nothing
 * to migrate (already has rules, or never used the legacy feature).
 */
export function migrateLegacyRules(
  config: AutoResponderConfig,
): AutoResponderConfig {
  if (config.rules.length > 0) return config;
  if (!config.eventChannelId && !config.supportChannelId) return config;

  const rules: AutoRule[] = [];

  if (config.eventChannelId) {
    rules.push({
      id: "legacy_events",
      enabled: true,
      name: "Event questions",
      triggers: [...LEGACY_EVENT_TRIGGERS, ...config.extraEventPhrases],
      exclusions: [...LEGACY_EVENT_EXCLUSIONS, ...PRAISE_EXCLUSIONS],
      matchMode: "fuzzy",
      threshold: 60,
      questionsOnly: true,
      minLength: 8,
      responseText: `Anything related to events or updates gets posted in <#${config.eventChannelId}>.`,
      useEmbed: true,
      embedTitle: "📅 Check the events channel",
      embedColor: "#5865f2",
      replyToUser: true,
      deleteAfterSec: 0,
      channelIds: [],
      ignoredChannelIds: [],
      ignoredRoleIds: [],
      cooldownSec: 30,
    });
  }

  if (config.supportChannelId) {
    rules.push({
      id: "legacy_lost_items",
      enabled: true,
      name: "Lost items",
      triggers: LEGACY_LOST_TRIGGERS,
      exclusions: [...PRAISE_EXCLUSIONS],
      matchMode: "fuzzy",
      threshold: 60,
      // Lost-item reports are statements, not questions.
      questionsOnly: false,
      minLength: 8,
      responseText: `Open a support ticket in <#${config.supportChannelId}> and the team will sort you out.`,
      useEmbed: true,
      embedTitle: "🎫 Need help?",
      embedColor: "#ed4245",
      replyToUser: true,
      deleteAfterSec: 0,
      channelIds: [],
      ignoredChannelIds: [],
      ignoredRoleIds: [],
      cooldownSec: 30,
    });
  }

  return { ...config, rules };
}
