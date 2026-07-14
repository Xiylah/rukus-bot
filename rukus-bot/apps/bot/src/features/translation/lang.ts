/**
 * Language mappings and helpers ported from the Python bot:
 *  - flag emoji → country code → language code
 *  - Google-style target codes → DeepL target codes
 *  - readable names for detection results
 */

/** Convert a flag emoji (two regional-indicator chars) to its ISO country code. */
export function flagToCountryCode(emoji: string): string | null {
  const cps = [...emoji].map((c) => c.codePointAt(0) ?? 0);
  if (cps.length !== 2) return null;
  if (!cps.every((cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff)) return null;
  return cps.map((cp) => String.fromCharCode(cp - 0x1f1e6 + 65)).join("");
}

/** Country code → deep-translator/Google language code. */
export const COUNTRY_TO_LANG: Record<string, string> = {
  US: "en", GB: "en", AU: "en", CA: "en", IE: "en", NZ: "en",
  FR: "fr", ES: "es", MX: "es", AR: "es", CO: "es", CL: "es",
  BR: "pt", PT: "pt", DE: "de", AT: "de", IT: "it",
  JP: "ja", KR: "ko", CN: "zh-CN", TW: "zh-TW", HK: "zh-TW",
  RU: "ru", SA: "ar", AE: "ar", EG: "ar", IN: "hi",
  NL: "nl", BE: "nl", PL: "pl", TR: "tr", VN: "vi",
  TH: "th", ID: "id", PH: "tl", SE: "sv", NO: "no",
  DK: "da", FI: "fi", GR: "el", UA: "uk", RO: "ro",
  HU: "hu", CZ: "cs", SK: "sk", IL: "he", IR: "fa",
  PK: "ur", BD: "bn", MY: "ms", BG: "bg", HR: "hr",
};

/** Google-style target codes → DeepL target codes (uppercase, some regional). */
export const GOOGLE_TO_DEEPL_TARGET: Record<string, string> = {
  en: "EN-US", es: "ES", fr: "FR", pt: "PT-BR", de: "DE",
  it: "IT", nl: "NL", ru: "RU", ja: "JA", ko: "KO",
  "zh-CN": "ZH", "zh-TW": "ZH", ar: "AR", tr: "TR", pl: "PL",
  vi: "VI", id: "ID", uk: "UK", el: "EL", sv: "SV",
  da: "DA", fi: "FI", ro: "RO", hu: "HU", cs: "CS",
  sk: "SK", bg: "BG", et: "ET", lt: "LT", lv: "LV",
  sl: "SL", nb: "NB", no: "NB", th: "TH", he: "HE",
};

/** Readable language names for detection output. */
export const LANG_CODE_TO_NAME: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese",
  de: "German", it: "Italian", nl: "Dutch", ru: "Russian",
  ja: "Japanese", ko: "Korean", "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)", zh: "Chinese", ar: "Arabic", hi: "Hindi",
  tr: "Turkish", pl: "Polish", vi: "Vietnamese", th: "Thai",
  id: "Indonesian", tl: "Filipino", uk: "Ukrainian", el: "Greek",
  sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish",
  ro: "Romanian", hu: "Hungarian", cs: "Czech", sk: "Slovak",
  he: "Hebrew", fa: "Persian", ur: "Urdu", bn: "Bengali",
  ms: "Malay", bg: "Bulgarian", hr: "Croatian",
};

/** Choices offered in the /translate command dropdown. */
export const LANGUAGE_CHOICES: Record<string, string> = {
  English: "en", Spanish: "es", French: "fr", Portuguese: "pt",
  German: "de", Italian: "it", Dutch: "nl", Russian: "ru",
  Japanese: "ja", Korean: "ko", "Chinese (Simplified)": "zh-CN",
  Arabic: "ar", Hindi: "hi", Turkish: "tr", Polish: "pl",
  Vietnamese: "vi", Thai: "th", Indonesian: "id", Ukrainian: "uk",
  Greek: "el", Swedish: "sv",
};

// ISO3_TO_ISO2 lives in @rukus/shared so the bot and the dashboard tester score
// language detection identically. Re-exported here for existing importers.
export { ISO3_TO_ISO2 } from "@rukus/shared";
