/**
 * Scoring for the TEXT INSIDE images (read by OCR), to catch scams posted as
 * screenshots: the fake "MrBeast casino" gallery, withdrawal-success popups,
 * rakeback and promo-code pages.
 *
 * Separate from scamScore on purpose. That scorer reads what a member typed,
 * with strict word boundaries. OCR output is noisy ("Witharawal", "Raseback"
 * are real misreads from these screenshots), so these patterns are looser,
 * and in exchange the bar to trigger is much higher: several independent
 * categories must appear together, including at least one that is specific
 * to this scam rather than to crypto or gaming in general.
 */

interface Signal {
  label: string;
  re: RegExp;
  /** A category that almost never appears outside this kind of scam. */
  strong: boolean;
}

const SIGNALS: Signal[] = [
  // "Withdrawal Success" / "Withdrawal of $2700 Was Successful". OCR drops or
  // swaps letters in both words ("Witharawal" and "Suscess" are real misreads
  // from these screenshots), so each word is matched loosely.
  { label: "withdrawal success", re: /w[il1]th[a-z]{1,3}wal[\s\S]{0,40}?s[uv][cs]{1,3}e[s5]/i, strong: true },
  { label: "rakeback", re: /[rp]a[kcs]e\s?ba[ck]k/i, strong: true },
  { label: "bonus/promo code", re: /(promo|activ[a-z]*|bonus|referral)\s*code|code\s*for\s*bonus/i, strong: true },
  { label: "MrBeast", re: /m\s?r\.?\s?b[e3]a[s5]t/i, strong: true },
  { label: "crypto network", re: /\b(usdt|trc\s?-?20|erc\s?-?20|bep\s?-?20|tether)\b/i, strong: false },
  { label: "crypto", re: /\b(crypto|bitcoin|btc|wallet\s*address)\b/i, strong: false },
  { label: "dollar amount", re: /\$\s?\d[\d,.]{2,}|\d[\d,.]{2,}\s?(usdt|usd)\b/i, strong: false },
  { label: "bonuses/deposit", re: /\b(bonuses|deposit|casino|vip\s*club)\b/i, strong: false },
];

export interface ImageScamResult {
  scam: boolean;
  /** Which categories matched, for the mod log. */
  matched: string[];
}

/** Needs this many distinct categories, at least one of them strong. */
export const IMAGE_SCAM_MIN_CATEGORIES = 3;

export function imageScamScore(ocrText: string): ImageScamResult {
  const matched = SIGNALS.filter((s) => s.re.test(ocrText));
  const hasStrong = matched.some((s) => s.strong);
  return {
    scam: hasStrong && matched.length >= IMAGE_SCAM_MIN_CATEGORIES,
    matched: matched.map((s) => s.label),
  };
}
