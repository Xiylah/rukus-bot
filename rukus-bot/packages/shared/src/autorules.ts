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
  return Math.max(0, 1 - editDistance(a, b) / max);
}

/**
 * How well a message matches one trigger phrase, 0-100.
 *
 * Score = the fraction of the trigger's words present in the message (each
 * word can match a near-identical word, so typos still count). Using the
 * TRIGGER as the denominator means a long message containing the trigger still
 * scores high, which is what people expect ("hey guys when is the next event?"
 * fully matches "when is the next event").
 */
export function phraseScore(message: string, trigger: string): number {
  const msgWords = tokens(message);
  const trigWords = tokens(trigger);
  if (trigWords.length === 0 || msgWords.length === 0) return 0;

  let matched = 0;
  for (const tw of trigWords) {
    let best = 0;
    for (const mw of msgWords) {
      const sim = mw === tw ? 1 : wordSimilarity(mw, tw);
      if (sim > best) best = sim;
      if (best === 1) break;
    }
    // Below 0.75 similarity we don't count the word as present at all.
    if (best >= 0.75) matched += best;
  }
  return Math.round((matched / trigWords.length) * 100);
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

const LEGACY_EVENT_EXCLUSIONS = [
  "that event was fun",
  "the event already ended",
  "we just had an event",
  "there are no events",
  "will be announced",
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
      exclusions: LEGACY_EVENT_EXCLUSIONS,
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
      exclusions: [],
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
