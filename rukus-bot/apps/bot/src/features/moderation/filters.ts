/** Basic content filters ported from the Python bot. */

const DRUG_TERMS = [
  "weed", "marijuana", "cannabis", "blunt", "bong", "dank",
  "kush", "reefer", "ganja", "420", "thc", "cbd", "edibles",
  "xan", "xanax", "xannies", "percs", "percocet", "oxycontin",
  "vicodin", "adderall", "addy", "molly", "mdma", "ecstasy",
  "cocaine", "meth", "heroin", "fentanyl", "fent", "lsd",
  "shrooms", "ketamine", "vape", "vaping", "juul", "dab", "dabs",
];

// Whole-word match so "potato"/"escape" won't trigger.
const DRUG_PATTERN = new RegExp(
  `\\b(${DRUG_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

export function containsDrugTerm(text: string): boolean {
  return DRUG_PATTERN.test(text);
}

export const DRUG_WARNINGS = [
  "Please keep all conversations appropriate for all ages. 🙏",
  "Let's keep the chat family-friendly for everyone here!",
  "Reminder: please keep all discussion appropriate for all ages.",
];

export function randomDrugWarning(): string {
  return DRUG_WARNINGS[Math.floor(Math.random() * DRUG_WARNINGS.length)]!;
}
