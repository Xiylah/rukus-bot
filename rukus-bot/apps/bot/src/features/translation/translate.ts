import { francAll } from "franc-min";
import * as deepl from "deepl-node";
import { translate as googleTranslate } from "@vitalets/google-translate-api";
import {
  coreText,
  shouldTranslate,
  scoreDetection,
  englishMarkerRatio,
  type TranslationConfig,
  type TranslationGateResult,
} from "@rukus/shared";
import { env } from "../../env.js";
import { log } from "../../lib/logger.js";
import { GOOGLE_TO_DEEPL_TARGET, LANG_CODE_TO_NAME } from "./lang.js";

/**
 * Translation core.
 *
 * The "should we translate this?" decision lives in @rukus/shared so the
 * dashboard tester runs the identical code path. This module owns only the
 * parts that need the network or a detector:
 *
 *   1. detect the source language locally, WITH a confidence score
 *   2. hand the message + config + detection to the shared gate
 *   3. on a pass: LRU cache → DeepL (preferred) → Google (fallback)
 *
 * Returns `{ text, src }` on success or `null` when nothing should be posted.
 */

const CACHE_MAX = 500;

/** Lowercase, drop punctuation, collapse whitespace for "unchanged?" compares. */
function normForCompare(s: string): string {
  return s
    .replace(/[^\w\s]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/**
 * Local detection with a confidence score. The scoring itself lives in
 * @rukus/shared so the dashboard tester reports identical numbers.
 */
export function detectWithConfidence(
  text: string,
  target = "en",
): { lang: string | null; confidence: number } {
  return scoreDetection(francAll(text, { minLength: 10 }), target, text);
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
  log.info("DeepL not configured - using Google only. Set DEEPL_API_KEY to enable.");
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

/** Run the shared gate against a message, using local detection for confidence. */
export function gateMessage(
  text: string,
  config: TranslationConfig,
  ctx: {
    channelId?: string;
    roleIds?: string[];
    userId?: string;
    isBot?: boolean;
    /** Override the target (ticket two-way mode translates per-recipient). */
    target?: string;
  } = {},
): TranslationGateResult {
  const target = ctx.target ?? config.targetLang;
  const core = coreText(text);
  const detected = core
    ? detectWithConfidence(core, target)
    : { lang: null, confidence: 0 };
  return shouldTranslate(text, { ...config, targetLang: target }, { ...ctx, detected });
}

/**
 * Translate `text` into `target`, honouring the guild's translation config.
 * Returns null when the gate says no or a backend fails.
 */
export async function translateText(
  text: string,
  config: TranslationConfig,
  ctx: {
    channelId?: string;
    roleIds?: string[];
    userId?: string;
    isBot?: boolean;
    target?: string;
    /**
     * Skip the gate entirely. Set for translations a human explicitly asked
     * for (/translate, a flag reaction, right-click > Translate): they said
     * "translate this", so a slang or length rule refusing them is just a bug.
     */
    force?: boolean;
  } = {},
): Promise<TranslationResult | null> {
  const target = ctx.target ?? config.targetLang;

  let core: string;
  if (ctx.force) {
    core = coreText(text);
    if (!core) return null;
  } else {
    const gate = gateMessage(text, config, ctx);
    if (!gate.translate) return null;
    core = gate.core;
  }

  const key = `${core.toLowerCase()}|${target}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const detected = detectWithConfidence(core, target);

  /**
   * Sanity-check what the API claims it translated FROM.
   *
   * The gate runs before the API and can only act on our local detector. When
   * that detector has no opinion, the message still goes to DeepL, which is
   * obliged to answer and will happily claim a short English message is
   * Pangasinan and "translate" it ("gm jakey poo" -> "Good morning, Jakey Poo",
   * reported as PAG -> EN).
   *
   * So: after the API answers, check its verdict against the one signal it does
   * not have, the English-marker ratio. If the text reads as the target language
   * to us, the API's exotic source language is nonsense and we throw the
   * translation away. Cheap, and it catches exactly the case the pre-gate cannot.
   */
  function apiVerdictIsNonsense(src: string): boolean {
    if (!src || src === "auto") return false;
    const base = (s: string) => s.split("-")[0]?.toLowerCase() ?? s;
    if (base(src) === base(target)) return true; // already the target: nothing to do

    // Only English has a marker list, so this check only applies when English
    // is what we are translating INTO.
    if (base(target) !== "en") return false;
    return englishMarkerRatio(core) >= 0.4;
  }

  // Prefer DeepL, fall back to Google.
  const viaDeepl = await deeplTranslate(core, target);
  if (viaDeepl) {
    if (normForCompare(viaDeepl.text) === normForCompare(core)) return null;
    if (apiVerdictIsNonsense(viaDeepl.src)) {
      log.info(
        `Discarded a translation: DeepL claimed ${viaDeepl.src.toUpperCase()} but the text reads as ${target.toUpperCase()}: ${JSON.stringify(core.slice(0, 60))}`,
      );
      return null;
    }
    cachePut(key, viaDeepl);
    return viaDeepl;
  }

  try {
    const res = await googleTranslate(core, { to: target });
    const translated = res.text;
    if (!translated) return null;
    if (normForCompare(translated) === normForCompare(core)) return null;
    const src = detected.lang ?? "auto";
    if (apiVerdictIsNonsense(src)) return null;
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
  const core = coreText(text);
  if (core.length < 12) return null;

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

  const local = detectWithConfidence(core);
  if (local.lang) return { code: local.lang, name: nameFor(local.lang) };
  return null;
}

function nameFor(code: string): string {
  return (
    LANG_CODE_TO_NAME[code] ??
    LANG_CODE_TO_NAME[code.split("-")[0] ?? ""] ??
    code.toUpperCase()
  );
}
