/**
 * Keyword + fuzzy classifier for the event / lost-item auto-responder.
 *
 * This replaces the Python bot's sentence-transformer model. It uses:
 *  - keyword/phrase matching against curated banks, and
 *  - a token-overlap (Jaccard-ish) score against example phrases,
 * gated by a lightweight question detector so statements don't trigger.
 *
 * It won't match every fuzzy paraphrase the ML model could, but it reliably
 * catches the common phrasings and is fully self-contained (no model, no API).
 */

// ---- Question detection (ported from the Python heuristics) ----

const DECLARATIVE = [
  /^there\s+(are\s+no|is\s+no|aren't\s+any|isn't\s+any)\b/,
  /^no\s+\w+\s+at\s+this\s+time/,
  /^they\s+(have|had|will\s+have)\b/,
  /^(it|this)\s+(was|is|will\s+be)\b/,
  /^(the|an?)\s+\w+\s+(was|is|has\s+been|will\s+be)\b/,
  /^i\s+(went|used|did|was|had|got)\b/,
  /^we\s+(just|already|recently)\b/,
  /^lol\b/,
];
const AUX_INVERSION =
  /^(is|are|was|were|do|does|did|can|could|will|would|should|has|have|had)\s/i;
const WH_QUESTION = /^(what|when|where|who|why|how|which|whose)\b/i;
const SOFT_SIGNALS = [
  "any upcoming", "any active", "any events",
  "give me the", "tell me the", "need to know",
];

function isDeclarative(text: string): boolean {
  const t = text.trim().toLowerCase();
  return DECLARATIVE.some((re) => re.test(t));
}

export function isQuestion(text: string): boolean {
  const t = text.trim();
  const lower = t.toLowerCase();
  if (isDeclarative(lower)) return false;
  if (t.includes("?")) return true;
  if (AUX_INVERSION.test(t)) return true;
  if (WH_QUESTION.test(t)) return true;
  return SOFT_SIGNALS.some((s) => lower.includes(s));
}

// ---- Example banks (same intent as the Python examples) ----

const EVENT_EXAMPLES = [
  "when is the next event", "any upcoming events", "what events are coming up",
  "is there an event this weekend", "whens the next update", "event schedule",
  "are we having an event soon", "when is admin abuse", "admin abuse this weekend",
  "is there admin abuse this week", "when is the next admin abuse",
  "admin abuse schedule", "when does admin abuse start", "is admin abuse happening",
  "what time is the next event", "is there an event today", "any events planned",
  "is there a live event", "is there currently a live event", "guys is there an event",
];

const LOST_ITEMS_EXAMPLES = [
  "i lost my items", "i lost my inventory", "my items are gone",
  "my inventory disappeared", "i lost everything in my inventory",
  "all my items are missing", "my stuff disappeared", "i lost all my stuff",
  "my items got wiped", "my inventory got reset", "i lost my gear",
  "all my gear is gone", "my items vanished", "i cant find my items",
  "where did my items go", "my inventory is empty", "i lost my weapons",
  "my weapons disappeared", "i lost my tools", "everything i had is gone",
];

// Strong keyword signals that boost confidence.
const EVENT_KEYWORDS = ["event", "admin abuse", "adminabuse", "update"];
const LOST_KEYWORDS = [
  "lost", "gone", "missing", "disappeared", "vanished", "wiped", "reset", "empty",
];
const INVENTORY_NOUNS = [
  "item", "items", "inventory", "gear", "stuff", "weapon", "weapons", "tool", "tools",
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Max token-overlap ratio of `text` against any phrase in the bank. */
function bestOverlap(tokens: Set<string>, bank: string[]): number {
  let best = 0;
  for (const phrase of bank) {
    const pt = tokenize(phrase);
    let inter = 0;
    for (const w of pt) if (tokens.has(w)) inter++;
    const ratio = inter / pt.size; // fraction of the example matched
    if (ratio > best) best = ratio;
  }
  return best;
}

export type Intent = "event" | "lost_items" | null;

/**
 * Classify a message. `extraEvent` are learned/admin-added phrasings merged
 * into the event bank. Returns the detected intent or null.
 */
export function classify(text: string, extraEvent: string[] = []): Intent {
  const lower = text.toLowerCase();
  const tokens = tokenize(text);

  // --- Lost items: statements, so no question gate. Needs a loss word + a noun,
  //     or strong phrase overlap. ---
  const hasLossWord = LOST_KEYWORDS.some((k) => lower.includes(k));
  const hasInvNoun = INVENTORY_NOUNS.some((n) => tokens.has(n));
  const lostOverlap = bestOverlap(tokens, LOST_ITEMS_EXAMPLES);
  if ((hasLossWord && hasInvNoun) || lostOverlap >= 0.6) {
    return "lost_items";
  }

  // --- Events: only on genuine questions. ---
  if (!isQuestion(text)) return null;

  const hasEventKeyword = EVENT_KEYWORDS.some((k) => lower.includes(k));
  const eventOverlap = bestOverlap(tokens, [...EVENT_EXAMPLES, ...extraEvent]);

  // A question mentioning an event keyword, or strong overlap, counts.
  if (hasEventKeyword && (isQuestion(text) || eventOverlap >= 0.4)) {
    return "event";
  }
  if (eventOverlap >= 0.6) return "event";

  return null;
}
