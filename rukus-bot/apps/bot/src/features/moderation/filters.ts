/** Basic content filters ported from the Python bot. */

const DRUG_TERMS = [
  "weed", "marijuana", "cannabis", "blunt", "bong", "dank",
  "kush", "reefer", "ganja", "420", "thc", "cbd", "edibles",
  "xan", "xanax", "xannies", "percs", "percocet", "oxycontin",
  "vicodin", "adderall", "addy", "molly", "mdma", "ecstasy",
  "cocaine", "meth", "heroin", "fentanyl", "fent", "lsd",
  "shrooms", "ketamine", "vape", "vaping", "juul", "dab", "dabs",
];

/** Build a whole-word matcher so "potato"/"escape" won't trigger. */
function drugPattern(terms: readonly string[]): RegExp {
  return new RegExp(
    `\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "i",
  );
}

// The built-in list is the default so existing servers are unchanged.
const DEFAULT_DRUG_PATTERN = drugPattern(DRUG_TERMS);

export function containsDrugTerm(text: string, terms?: readonly string[]): boolean {
  // A configured list overrides the built-in one; an empty list means "unset",
  // so we fall back rather than matching nothing.
  const pattern = terms && terms.length > 0 ? drugPattern(terms) : DEFAULT_DRUG_PATTERN;
  return pattern.test(text);
}

export const DRUG_WARNINGS = [
  "Please keep all conversations appropriate for all ages. 🙏",
  "Let's keep the chat family-friendly for everyone here!",
  "Reminder: please keep all discussion appropriate for all ages.",
];

export function randomDrugWarning(override?: string): string {
  // A configured warning replaces the rotating built-ins entirely.
  if (override && override.trim()) return override;
  return DRUG_WARNINGS[Math.floor(Math.random() * DRUG_WARNINGS.length)]!;
}
