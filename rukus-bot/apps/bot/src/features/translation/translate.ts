import { franc } from "franc-min";
import * as deepl from "deepl-node";
import { translate as googleTranslate } from "@vitalets/google-translate-api";
import { env } from "../../env.js";
import { log } from "../../lib/logger.js";
import {
  GOOGLE_TO_DEEPL_TARGET,
  ISO3_TO_ISO2,
  LANG_CODE_TO_NAME,
} from "./lang.js";

/**
 * Translation core — a faithful port of the Python bot's translate_text():
 *
 *   1. strip URLs/mentions/emoji, apply a length gate
 *   2. slang-only skip
 *   3. local detection: skip if already confidently the target language
 *   4. LRU cache lookup
 *   5. DeepL (preferred) → Google (fallback) on a genuine miss
 *
 * Returns `{ text, src }` on success or `null` when nothing should be posted
 * (too short, slang, already target language, or a backend error).
 */

const TRANSLATE_MIN_LEN = 12;
const CACHE_MAX = 500;

const URL_RE = /https?:\/\/\S+/g;
const MENTION_RE = /<a?[@#!&:][^>]+>/g;
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;

// Common chat slang that shouldn't trigger translation on its own.
const SLANG = new Set([
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
]);

/** Remove URLs/mentions/emoji to see if any real language remains. */
function strippable(text: string): string {
  return text
    .replace(URL_RE, " ")
    .replace(MENTION_RE, " ")
    .replace(EMOJI_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove standalone slang tokens; return whatever real text is left. */
function stripSlang(text: string): string {
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, " ");
  return cleaned
    .split(/\s+/)
    .filter((w) => w && !SLANG.has(w))
    .join(" ")
    .trim();
}

/** Lowercase, drop punctuation, collapse whitespace for "unchanged?" compares. */
function normForCompare(s: string): string {
  return s
    .replace(/[^\w\s]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Best-effort local language detection → 2-letter code, or null. */
function localDetect(text: string): string | null {
  // franc needs a bit of text to be reliable; short strings return "und".
  const iso3 = franc(text, { minLength: 10 });
  if (iso3 === "und") return null;
  return ISO3_TO_ISO2[iso3] ?? null;
}

// ---- LRU cache: `${coreLower}|${target}` → { text, src } ----
const cache = new Map<string, { text: string; src: string }>();
function cacheGet(key: string) {
  const v = cache.get(key);
  if (v) {
    cache.delete(key);
    cache.set(key, v); // mark most-recently-used
  }
  return v;
}
function cachePut(key: string, value: { text: string; src: string }) {
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// ---- DeepL client (optional) ----
let deeplClient: deepl.Translator | null = null;
if (env.DEEPL_API_KEY) {
  try {
    deeplClient = new deepl.Translator(env.DEEPL_API_KEY);
    log.info("DeepL engine enabled (Google is fallback).");
  } catch (e) {
    log.warn(`DeepL init failed, using Google only: ${String(e)}`);
  }
} else {
  log.info("DeepL not configured — using Google only. Set DEEPL_API_KEY to enable.");
}

async function deeplTranslate(
  core: string,
  target: string,
): Promise<{ text: string; src: string } | null> {
  if (!deeplClient) return null;
  const deeplTarget = GOOGLE_TO_DEEPL_TARGET[target];
  if (!deeplTarget) return null; // unsupported target → fall back to Google
  try {
    const result = await deeplClient.translateText(
      core,
      null,
      deeplTarget as deepl.TargetLanguageCode,
    );
    const text = result.text;
    if (!text) return null;
    const src = (result.detectedSourceLang ?? "auto").toLowerCase();
    return { text, src };
  } catch (e) {
    log.warn(`DeepL error, falling back to Google: ${String(e)}`);
    return null;
  }
}

export interface TranslationResult {
  text: string;
  src: string;
}

/**
 * Translate `text` into `target`. Returns null when nothing should be posted.
 */
export async function translateText(
  text: string,
  target = "en",
): Promise<TranslationResult | null> {
  const core = strippable(text);
  if (core.length < TRANSLATE_MIN_LEN) return null;
  if (stripSlang(core).length < TRANSLATE_MIN_LEN) return null;

  // Gamertag/leetspeak gate: drop tokens with fused digits for the decision.
  const noDigitTokens = core
    .split(/\s+/)
    .filter((w) => !/\d/.test(w))
    .join(" ");
  if (noDigitTokens.length < TRANSLATE_MIN_LEN) return null;

  // Skip if we're confident it's already the target language.
  const detected = localDetect(core);
  if (detected) {
    const baseTarget = target.split("-")[0]?.toLowerCase();
    const baseDetected = detected.split("-")[0]?.toLowerCase();
    if (baseDetected === baseTarget) return null;
  }

  const key = `${core.toLowerCase()}|${target}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // Prefer DeepL, fall back to Google.
  const viaDeepl = await deeplTranslate(core, target);
  if (viaDeepl) {
    if (normForCompare(viaDeepl.text) === normForCompare(core)) return null;
    cachePut(key, viaDeepl);
    return viaDeepl;
  }

  try {
    const res = await googleTranslate(core, { to: target });
    const translated = res.text;
    if (!translated) return null;
    if (normForCompare(translated) === normForCompare(core)) return null;
    // @vitalets returns the detected source on res.raw; fall back to local.
    const src = detected ?? "auto";
    const out = { text: translated, src };
    cachePut(key, out);
    return out;
  } catch (e) {
    log.warn(`Google translate error: ${String(e)}`);
    return null;
  }
}

/** Detect the language of `text` → { code, name } or null. */
export async function detectLanguage(
  text: string,
): Promise<{ code: string; name: string } | null> {
  const core = strippable(text);
  if (core.length < TRANSLATE_MIN_LEN) return null;

  // Prefer DeepL's genuine detection if available.
  if (deeplClient) {
    try {
      const result = await deeplClient.translateText(core, null, "en-US");
      const code = (result.detectedSourceLang ?? "").toLowerCase();
      if (code) return { code, name: nameFor(code) };
    } catch {
      /* fall through to local */
    }
  }

  const local = localDetect(core);
  if (local) return { code: local, name: nameFor(local) };
  return null;
}

function nameFor(code: string): string {
  return (
    LANG_CODE_TO_NAME[code] ??
    LANG_CODE_TO_NAME[code.split("-")[0] ?? ""] ??
    code.toUpperCase()
  );
}
