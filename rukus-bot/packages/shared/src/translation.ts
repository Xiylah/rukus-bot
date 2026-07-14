/**
 * Translation gate: decides whether a message should be translated at all.
 *
 * This is the half of translation that misfires, so it lives here in `shared`
 * and NOT in the bot: the dashboard's tester imports the exact same function
 * the bot runs, so what staff see in the preview is what actually happens.
 *
 * Everything the gate consults comes from config. There are no hardcoded word
 * lists or thresholds, because the whole point is that a server can fix its own
 * false positives ("bruh", "ez clap", a clan tag) without a code change.
 *
 * The gate never calls a translation API. It returns a decision plus a reason,
 * which is what makes it testable and explainable in the dashboard.
 */

/** Why the gate allowed or blocked a message. Shown verbatim in the tester. */
export type SkipReason =
  | "disabled"
  | "too-short"
  | "too-few-words"
  | "slang-only"
  | "no-letters"
  | "ignored-channel"
  | "ignored-role"
  | "ignored-user"
  | "bot"
  | "command-prefix"
  | "code-block"
  | "link-only"
  | "phrase-allowlist"
  | "always-phrase"
  | "detected-target"
  | "detect-unsure"
  | "source-not-allowed"
  | "ok";

export interface TranslationGateResult {
  /** True when the message should be sent to the translation API. */
  translate: boolean;
  reason: SkipReason;
  /** Human-readable explanation, shown in the dashboard tester. */
  detail: string;
  /** The text that would actually be sent (URLs/mentions/emoji stripped). */
  core: string;
}

/** The subset of TranslationConfig the gate needs. Kept structural to avoid a cycle. */
export interface GateConfig {
  autoTranslate: boolean;
  targetLang: string;
  minLength: number;
  minWords: number;
  skipSlang: boolean;
  slangWords: string[];
  neverTranslate: string[];
  alwaysTranslate: string[];
  ignoreChannelIds: string[];
  ignoreRoleIds: string[];
  ignoreUserIds: string[];
  ignoreBots: boolean;
  ignoreCommandPrefixes: string[];
  ignoreCodeBlocks: boolean;
  sourceLangs: string[];
  detectConfidence: number;
  requireConfidentDetect: boolean;
}

export interface GateContext {
  channelId?: string;
  roleIds?: string[];
  userId?: string;
  isBot?: boolean;
  /** Detected source language (2-letter) and 0-100 confidence, if known. */
  detected?: { lang: string | null; confidence: number };
}

const URL_RE = /https?:\/\/\S+/g;
const MENTION_RE = /<a?[@#!&:][^>]+>/g;
const CUSTOM_EMOJI_RE = /<a?:\w+:\d+>/g;
const UNICODE_EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]+/gu;
const CODE_BLOCK_RE = /```[\s\S]*?```|`[^`]+`/g;

/**
 * Strip the things that aren't language: links, mentions, custom emoji, emoji.
 * This is the text that would actually be sent to the translator.
 */
export function coreText(text: string): string {
  return text
    .replace(CODE_BLOCK_RE, " ")
    .replace(URL_RE, " ")
    .replace(CUSTOM_EMOJI_RE, " ")
    .replace(MENTION_RE, " ")
    .replace(UNICODE_EMOJI_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split into comparable word tokens (lowercased, punctuation dropped). */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Does `text` contain `phrase`? Multi-word phrases match as a contiguous run of
 * words; single words match a whole word (so "ez" never matches "ezreal").
 */
export function containsPhrase(text: string, phrase: string): boolean {
  const t = words(text);
  const p = words(phrase);
  if (p.length === 0 || t.length === 0) return false;
  for (let i = 0; i + p.length <= t.length; i++) {
    let hit = true;
    for (let j = 0; j < p.length; j++) {
      if (t[i + j] !== p[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * Decide whether a message should be translated.
 *
 * Order matters and is deliberate: cheap structural skips first, then the
 * server's own allow/deny phrases, then language detection last (it's the part
 * that gets things wrong, so we give config every chance to decide first).
 */
export function shouldTranslate(
  text: string,
  config: GateConfig,
  ctx: GateContext = {},
): TranslationGateResult {
  const core = coreText(text);
  const no = (reason: SkipReason, detail: string): TranslationGateResult => ({
    translate: false,
    reason,
    detail,
    core,
  });

  if (!config.autoTranslate) {
    return no("disabled", "Auto-translate is turned off.");
  }

  // ---- Who / where ----
  if (ctx.isBot && config.ignoreBots) {
    return no("bot", "Message is from a bot, and bots are ignored.");
  }
  if (ctx.channelId && config.ignoreChannelIds.includes(ctx.channelId)) {
    return no("ignored-channel", "This channel is on the ignore list.");
  }
  if (ctx.userId && config.ignoreUserIds.includes(ctx.userId)) {
    return no("ignored-user", "This user is on the ignore list.");
  }
  const roleHit = ctx.roleIds?.find((r) => config.ignoreRoleIds.includes(r));
  if (roleHit) {
    return no("ignored-role", "This member has an ignored role.");
  }

  // ---- Structural skips ----
  const prefixHit = config.ignoreCommandPrefixes.find(
    (p) => p && text.trim().startsWith(p),
  );
  if (prefixHit) {
    return no(
      "command-prefix",
      `Starts with "${prefixHit}", which is a command prefix.`,
    );
  }
  if (config.ignoreCodeBlocks && /```|`[^`]+`/.test(text)) {
    return no("code-block", "Contains code formatting.");
  }
  if (!core) {
    return no("link-only", "Nothing left after removing links, mentions and emoji.");
  }
  if (!/\p{L}/u.test(core)) {
    return no("no-letters", "No letters in the message (numbers/symbols only).");
  }

  // ---- Server's own phrase lists (these beat detection on purpose) ----
  const always = config.alwaysTranslate.find((p) => containsPhrase(core, p));
  const never = config.neverTranslate.find((p) => containsPhrase(core, p));

  // "Never" wins over "always": it's the more specific fix for a false positive.
  if (never) {
    return no("phrase-allowlist", `Matches the never-translate phrase "${never}".`);
  }

  if (always) {
    return {
      translate: true,
      reason: "always-phrase",
      detail: `Matches the always-translate phrase "${always}", so every other check is skipped.`,
      core,
    };
  }

  // ---- Length + slang ----
  if (core.length < config.minLength) {
    return no(
      "too-short",
      `Only ${core.length} characters, and the minimum is ${config.minLength}.`,
    );
  }

  if (config.skipSlang) {
    const slang = new Set(config.slangWords.map((s) => s.toLowerCase()));
    const remaining = words(core).filter((w) => !slang.has(w));
    if (remaining.length === 0) {
      return no("slang-only", "Every word is on the slang list.");
    }
    // Re-apply the length gate to what's left, so "lol ok" style messages that
    // are mostly slang don't sneak past on their leftovers.
    if (remaining.join(" ").length < config.minLength) {
      return no(
        "slang-only",
        `Only "${remaining.join(" ")}" is left after removing slang, which is under the ${config.minLength} character minimum.`,
      );
    }
  }

  // ---- Language detection (last, because it's the unreliable part) ----
  const det = ctx.detected;
  if (det) {
    const base = (s: string) => s.split("-")[0]?.toLowerCase() ?? s;
    const target = base(config.targetLang);

    if (det.lang && base(det.lang) === target) {
      return no("detected-target", `Already looks like the target language.`);
    }

    // Not enough evidence to detect ANYTHING, no matter how confident the
    // detector sounds. A trigram model scores whatever it is given, so three
    // short nonsense tokens ("gm jakey poo") come back as Czech at 100%, and the
    // translator then invents a source language for them (that message was
    // reported as Pangasinan). Confidence cannot save us here, because the
    // detector is confident; what is missing is material to detect.
    //
    // Counting words rather than characters is what matters: a name plus two
    // abbreviations is not a sentence, however many letters it happens to have.
    //
    // But "words" only means anything in a script that puts spaces between them.
    // Japanese, Chinese and Thai do not, so a whole sentence counts as one or
    // two "words" and would be wrongly refused. For those, a run of script
    // characters IS the evidence, so count characters instead.
    if (config.requireConfidentDetect && !isUnspacedScript(core)) {
      const wordCount = words(core).filter((w) => w.length >= 3).length;
      if (wordCount < config.minWords) {
        return no(
          "too-few-words",
          `Only ${wordCount} substantial word(s), and at least ${config.minWords} are needed to identify a language reliably.`,
        );
      }
    }

    // The core fix for "it translated my English": when the detector is not
    // confident, do nothing instead of guessing. Slangy English is exactly the
    // text franc is worst at, and a wrong guess is what produces the misfire.
    const unsure = !det.lang || det.confidence < config.detectConfidence;
    if (unsure && config.requireConfidentDetect) {
      return no(
        "detect-unsure",
        det.lang
          ? `Detected ${det.lang} but only ${det.confidence}% confident, and ${config.detectConfidence}% is required.`
          : `Couldn't identify the language confidently.`,
      );
    }

    // Optional strict list: only translate FROM these languages.
    if (config.sourceLangs.length > 0 && det.lang) {
      if (!config.sourceLangs.map(base).includes(base(det.lang))) {
        return no(
          "source-not-allowed",
          `Detected ${det.lang}, which is not in the translate-from list.`,
        );
      }
    }
  }

  return {
    translate: true,
    reason: "ok",
    detail: "Passes every check, so it gets translated.",
    core,
  };
}

/**
 * franc returns ISO 639-3 codes; map the common ones back to the 2-letter codes
 * our translators use. Lives here (not in the bot) so the dashboard tester
 * scores detection identically.
 */
export const ISO3_TO_ISO2: Record<string, string> = {
  eng: "en", spa: "es", fra: "fr", por: "pt", deu: "de",
  ita: "it", nld: "nl", rus: "ru", jpn: "ja", kor: "ko",
  cmn: "zh-CN", ara: "ar", hin: "hi", tur: "tr", pol: "pl",
  vie: "vi", tha: "th", ind: "id", ukr: "uk", ell: "el",
  swe: "sv", dan: "da", nor: "no", fin: "fi", ron: "ro",
  hun: "hu", ces: "cs", slk: "sk", heb: "he", fas: "fa",
  urd: "ur", ben: "bn", msa: "ms", bul: "bg", hrv: "hr",
};

/**
 * Very common English function words. Trigram detectors like franc regularly
 * mislabel short English sentences ("yo can someone help me build my house"
 * scores as Turkish), and no confidence threshold fixes a detector that is
 * confidently wrong. These words are an independent, cheap signal that trigram
 * models ignore: if a message is full of them, it is English no matter what
 * franc says.
 *
 * Only used when the TARGET is English, which is the overwhelmingly common
 * case and the one the misfire reports come from.
 */
const ENGLISH_MARKERS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "so", "because",
  "is", "are", "was", "were", "be", "been", "am", "im",
  "do", "does", "did", "dont", "doesnt", "didnt",
  "have", "has", "had", "can", "cant", "could", "will", "wont", "would",
  "should", "shall", "may", "might", "must",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "mine", "yours",
  "this", "that", "these", "those", "there", "here", "what", "when", "where",
  "who", "why", "how", "which",
  "to", "of", "in", "on", "at", "for", "with", "from", "by", "about",
  "into", "over", "under", "up", "down", "out", "off", "again",
  "not", "no", "yes", "all", "any", "some", "every", "each", "both",
  "more", "most", "other", "than", "then", "just", "only", "very", "too",
  "get", "got", "make", "made", "go", "going", "want", "need", "know",
  "help", "please", "thanks", "someone", "anyone", "everyone", "something",
  "anything", "nothing", "now", "still", "back", "one", "two", "new", "good",
]);

/**
 * Does this text use a script that does NOT separate words with spaces?
 * Japanese, Chinese, Korean (partly), Thai. For these, counting "words" is
 * meaningless: a full sentence looks like one or two tokens, so any word-count
 * rule would refuse to translate perfectly good text. A run of these characters
 * is itself strong evidence of the language.
 */
export function isUnspacedScript(text: string): boolean {
  // CJK ideographs, hiragana, katakana, Thai, and the Hangul syllable block.
  const script =
    /[぀-ヿ㐀-䶿一-鿿豈-﫿฀-๿가-힯]/gu;
  const hits = text.match(script)?.length ?? 0;
  // A handful of CJK characters carries more signal than several Latin words.
  return hits >= 4;
}

/**
 * What fraction of a message's words are common English function words?
 * Returns 0-1. Real English prose sits high; foreign text sits near zero.
 */
export function englishMarkerRatio(text: string): number {
  const w = words(text);
  if (w.length === 0) return 0;
  return w.filter((x) => ENGLISH_MARKERS.has(x)).length / w.length;
}

/**
 * Score a franc result into { lang, confidence }, RELATIVE TO THE TARGET.
 *
 * Both the bot and the dashboard tester call this with francAll's output, so
 * the preview cannot drift from real behaviour.
 *
 * The question that matters is not "which language is this?" but "how sure are
 * we this is NOT already the target?" - translating text that is already
 * English is the whole bug. franc's raw scores barely separate a right guess
 * from a wrong one on short text (plain English can score 70% as Turkish), so
 * the winner's own score carries little signal. The GAP between the winner and
 * the target's own score does: genuinely foreign text leaves the target far
 * behind, while misdetected English keeps it close behind.
 *
 * @param ranked francAll() output: [iso3, score][] sorted best-first.
 * @param text  the message itself, for the English-marker sanity check.
 */
export function scoreDetection(
  ranked: [string, number][],
  target = "en",
  text = "",
): { lang: string | null; confidence: number } {
  const base = (s: string) => s.split("-")[0]?.toLowerCase() ?? s;
  const targetBase = base(target);

  // Sanity check BEFORE trusting franc. When the target is English and the
  // message is visibly English by its function words, franc's verdict is
  // overruled: it is confidently wrong on short English often enough that this
  // is the only reliable guard. Half the words being markers is far above what
  // any genuinely foreign sentence produces.
  if (targetBase === "en" && text && englishMarkerRatio(text) >= 0.4) {
    return { lang: "en", confidence: 100 };
  }

  const top = ranked[0];
  if (!top || top[0] === "und") return { lang: null, confidence: 0 };

  const lang = ISO3_TO_ISO2[top[0]] ?? null;
  if (!lang) return { lang: null, confidence: 0 };

  // The winner IS the target: nothing to translate, and the gate's
  // "already target language" check should fire cleanly.
  if (base(lang) === targetBase) return { lang, confidence: 100 };

  const targetEntry = ranked.find(
    ([iso3]) => base(ISO3_TO_ISO2[iso3] ?? "") === targetBase,
  );
  const targetScore = targetEntry ? targetEntry[1] : 0;

  // Confidence = the winner's lead over the target, normalised. A decisive lead
  // (real foreign text) approaches 100; a photo finish (English franc
  // mislabelled) collapses toward 0, so the gate stays quiet.
  const lead = Math.max(0, top[1] - targetScore);
  return { lang, confidence: Math.round(Math.min(1, lead / 0.25) * 100) };
}

/** Language options offered in the dashboard pickers. */
export const TRANSLATION_LANGS: [string, string][] = [
  ["English", "en"], ["Spanish", "es"], ["French", "fr"], ["Portuguese", "pt"],
  ["German", "de"], ["Italian", "it"], ["Dutch", "nl"], ["Russian", "ru"],
  ["Japanese", "ja"], ["Korean", "ko"], ["Chinese", "zh-CN"], ["Arabic", "ar"],
  ["Hindi", "hi"], ["Turkish", "tr"], ["Polish", "pl"], ["Vietnamese", "vi"],
  ["Thai", "th"], ["Indonesian", "id"], ["Ukrainian", "uk"], ["Greek", "el"],
  ["Swedish", "sv"], ["Romanian", "ro"], ["Czech", "cs"], ["Hebrew", "he"],
];

/** Sensible defaults for a brand-new server. Ported from the old hardcoded list. */
export const DEFAULT_SLANG = [
  "ty", "tysm", "thx", "thanks", "np", "yw", "wyd", "wym", "hru", "wbu", "wb",
  "gg", "glhf", "brb", "afk", "gtg", "g2g", "ttyl", "lol", "lmao", "lmfao",
  "rofl", "omg", "omfg", "wtf", "idk", "idc", "ikr", "imo", "imho", "tbh",
  "ngl", "fr", "frfr", "smh", "istg", "irl", "dm", "pm", "afaik", "asap",
  "aka", "btw", "nvm", "rn", "atm", "ez", "op", "pog", "poggers", "w", "l",
  "ratio", "based", "cap", "nocap", "bet", "fam", "bruh", "bro", "yo", "sup",
  "wsg", "wassup", "ong", "icl", "lowkey", "highkey", "sus", "goat", "mid",
  "gyat", "rizz", "fyp", "sheesh", "yeet", "oof", "yikes", "welp", "meh", "eh",
  "hmm", "ok", "okay", "kk", "k", "yeah", "yea", "yep", "nah", "nope", "ye",
  "ya", "u", "ur", "pls", "plz", "plss", "ffs", "wdym",
  // Greetings. These are short, extremely common, and exactly the kind of thing
  // a trigram detector mislabels: "gm jakey poo" was confidently called Czech
  // and then "translated" from Pangasinan.
  "gm", "gn", "gmorning", "gnight", "hi", "hey", "hello", "yo", "sup", "hiya",
  "morning", "night", "bye", "cya", "seeya", "gtg", "o7",
  "lol", "lolol", "haha", "hahaha", "hehe", "xd", "lmaoo", "ez",
  "ily", "ilysm", "wby", "hbu", "nm", "nmu", "same", "true", "facts",
  "yessir", "yep", "yup", "nope", "nvm", "brb", "wait", "what", "huh",
];
